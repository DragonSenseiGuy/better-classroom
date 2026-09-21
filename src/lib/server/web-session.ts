// Canonical owner of the Classroom cookie session: jar, cached tokens,
// device-cookie rotation, profile cache, and people resolution.
//
// Both the enrichment path (rich.ts) and the record source (web-records.ts)
// go through here, so token caching, rotation, and profile writes happen
// exactly once per user no matter which sync path runs. Callers must not
// write webProfiles or bypass sessionTokens; use ensureProfiles,
// fetchCoursePeople, and sessionTokensWithHtml instead.
//
// Cookie probes live in web-probe.ts: they run before any session exists
// and never touch the cache, rotation state, or profile store.

import {
	SessionError,
	fetchCourseMembers,
	fetchHomeHtml,
	fetchProfiles,
	fetchStreamPage,
	parseTokens,
	rotateSession,
	STREAM_MAX_PAGES,
	STREAM_PAGE_SIZE,
	type CookieJar,
	type StreamPage,
	type WebTokens
} from './classroom-web';
import { warmAvatars } from './avatars';
import {
	getKeepAlive,
	getProfile,
	getWebProfiles,
	getWebSession,
	saveKeepAlive,
	saveWebProfiles,
	saveWebSession,
	type WebSession
} from './store';
import { perUser } from './tenant';
import type { Author } from '#lib/shared/types.ts';
import type { RawTeacher } from './providers';

const TOKEN_TTL = 20 * 60_000;
const PROFILE_BATCH = 25;

/** Single coercion from a stored profile to the provider teacher shape. */
export const toRawTeacher = (id: string, p?: Author): RawTeacher => ({
	userId: id,
	name: p?.name,
	email: p?.email,
	photoUrl: p?.photoUrl
});

/** Named teachers only: nameless ids carry no display value for rosters. */
export const namedTeachers = (
	ids: string[],
	profiles: Record<string, Author>
): (RawTeacher & { name: string })[] => {
	const out: (RawTeacher & { name: string })[] = [];
	for (const id of ids) {
		const p = profiles[id];
		if (p?.name) out.push({ userId: id, name: p.name, email: p.email, photoUrl: p.photoUrl });
	}
	return out;
};

/** Single coercion from a roster teacher to the enrichment author shape. */
export const toAuthor = (p: RawTeacher & { name: string }): Author => ({
	name: p.name,
	email: p.email,
	photoUrl: p.photoUrl
});

/** Case-insensitive profile match by email; the single owner of that scan. */
export function findProfileByEmail(
	profiles: Record<string, Author>,
	email: string | undefined
): { id: string; author: Author } | undefined {
	const wanted = email?.toLowerCase();
	if (!wanted) return undefined;
	const found = Object.entries(profiles).find(([, p]) => p.email?.toLowerCase() === wanted);
	return found ? { id: found[0], author: found[1] } : undefined;
}

// One jar per pasted cookie, per user. The keep-alive timer and the sync
// walk run on their own schedules; separate jars would each write their own
// copy of the cookie back and could overwrite a freshly rotated
// device-session token with the value it replaced.
const local = perUser(() => ({
	cached: null as { key: string; tokens: WebTokens; html: string; at: number } | null,
	shared: null as { savedAt: number; jar: CookieJar } | null,
	rotating: null as Promise<void> | null
}));

export function requireSession(): WebSession {
	const session = getWebSession();
	if (!session) throw new Error('No Classroom session saved. Connect with a cookie first.');
	return session;
}

export function sessionJar(session: WebSession): CookieJar {
	const l = local();
	if (l.shared?.savedAt !== session.savedAt)
		l.shared = {
			savedAt: session.savedAt,
			jar: {
				cookie: session.cookie,
				onChange: (cookie) => saveWebSession({ ...session, cookie })
			}
		};
	return l.shared.jar;
}

/**
 * Rotation + home-page fetch + token parse in one place, with caching.
 * Tokens are parsed from the same HTML that is returned, and both are
 * cached together so callers never mix stale tokens with a fresh page
 * (or pay for a second page load). Pass fresh=true to bypass the cache
 * after a SessionError.
 */
export async function sessionTokensWithHtml(
	session: WebSession,
	fresh = false
): Promise<{ tokens: WebTokens; html: string }> {
	const l = local();
	const key = `${session.authuser}:${session.savedAt}`;
	if (!fresh && l.cached && l.cached.key === key && Date.now() - l.cached.at < TOKEN_TTL) {
		return { tokens: l.cached.tokens, html: l.cached.html };
	}
	await ensureRotated(session);
	const html = await fetchHomeHtml(sessionJar(session), session.authuser);
	const tokens = parseTokens(html);
	saveKeepAlive({ ...getKeepAlive(), refreshedAt: Date.now() });
	l.cached = { key, tokens, html, at: Date.now() };
	return { tokens, html };
}

export async function sessionTokens(session: WebSession, fresh = false): Promise<WebTokens> {
	const { tokens } = await sessionTokensWithHtml(session, fresh);
	return tokens;
}

export function ensureRotated(session: WebSession): Promise<void> {
	const l = local();
	if (l.rotating) return l.rotating;
	const state = getKeepAlive();
	if (Date.now() < (state.nextRotateAt ?? 0)) return Promise.resolve();
	l.rotating = rotateSession(sessionJar(session))
		.then(({ rotated, nextSeconds }) => {
			saveKeepAlive({
				...getKeepAlive(),
				rotatedAt: rotated ? Date.now() : state.rotatedAt,
				nextRotateAt: Date.now() + nextSeconds * 1000
			});
			console.log(
				`classroom session: ${rotated ? 'rotated device cookies' : 'rotation issued no new cookies'}, next in ${nextSeconds}s`
			);
		})
		.finally(() => {
			l.rotating = null;
		});
	return l.rotating;
}

/** The signed-in student's web-side id, matched by email among synced profiles. */
export function findWebIdByEmail(): string | null {
	return findProfileByEmail(getWebProfiles(), getProfile()?.email)?.id ?? null;
}

/**
 * Single owner of the "I can act as the student" context: session, resolved
 * student id, live jar, and cached tokens. Both the enrichment path and the
 * record source go through here instead of repeating the four-step lookup.
 */
export async function withWebStudent() {
	const session = requireSession();
	const studentId = findWebIdByEmail();
	if (!studentId) throw new Error('Your Classroom web id is not known yet; run a sync first.');
	const jar = sessionJar(session);
	const tokens = await sessionTokens(session);
	return { session, studentId, jar, tokens };
}

/**
 * Fetches profiles missing from the store, merges them in, and returns the
 * full profile map. The sole writer of webProfiles: callers must use this
 * (or fetchCoursePeople) instead of saving profiles themselves. Tokens
 * resolve internally through the shared cache, so callers never thread them.
 * Callers pass clean string ids; dirty creator/comment id maps are filtered
 * at the call site.
 */
export async function ensureProfiles(
	session: WebSession,
	ids: string[]
): Promise<Record<string, Author>> {
	const profiles = getWebProfiles();
	const missing = [...new Set(ids)].filter((id) => !(id in profiles));
	if (!missing.length) return profiles;
	const tokens = await sessionTokens(session);
	const jar = sessionJar(session);
	for (let i = 0; i < missing.length; i += PROFILE_BATCH) {
		const batch = missing.slice(i, i + PROFILE_BATCH);
		const found = await fetchProfiles(jar, session.authuser, tokens, batch);
		for (const p of found) profiles[p.id] = { name: p.name, email: p.email, photoUrl: p.photoUrl };
		for (const id of batch) profiles[id] ??= {};
		void warmAvatars(found.map((p) => p.photoUrl));
	}
	saveWebProfiles(profiles);
	return profiles;
}

/**
 * Canonical course stream walk. Owns jar, tokens, pagination, and the
 * single retry on SessionError, so the enrichment path and the record
 * source never thread `(jar, authuser, tokens)` themselves and never
 * diverge on retry policy. Resumes from the last continuation token after
 * a refresh instead of restarting the course.
 */
export async function* iterateCourseStream(
	session: WebSession,
	courseId: string,
	options: { pageSize?: number; maxPages?: number } = {}
): AsyncGenerator<StreamPage> {
	const pageSize = options.pageSize ?? STREAM_PAGE_SIZE;
	const maxPages = options.maxPages ?? STREAM_MAX_PAGES;
	let tokens = await sessionTokens(session);
	let token: string | undefined;
	let refreshed = false;
	for (let page = 0; page < maxPages; page++) {
		let result: StreamPage;
		try {
			result = await fetchStreamPage(
				sessionJar(session),
				session.authuser,
				tokens,
				courseId,
				pageSize,
				token
			);
		} catch (err) {
			if (!(err instanceof SessionError) || refreshed) throw err;
			refreshed = true;
			tokens = await sessionTokens(session, true);
			page--;
			continue;
		}
		yield result;
		if (!result.hasMore || !result.token) break;
		token = result.token;
	}
}

/**
 * Canonical people resolution: members plus profiles, with named teachers
 * only. Resolves tokens internally through the shared cache so callers never
 * thread them. The only store write is the single one inside ensureProfiles.
 */
export async function fetchCoursePeople(
	session: WebSession,
	courseId: string
): Promise<{
	teachers: (RawTeacher & { name: string })[];
	students: (RawTeacher & { name: string })[];
}> {
	const tokens = await sessionTokens(session);
	const members = await fetchCourseMembers(sessionJar(session), session.authuser, tokens, courseId);
	const profiles = await ensureProfiles(session, [...members.teachers, ...members.students]);
	return {
		teachers: namedTeachers(members.teachers, profiles),
		students: namedTeachers(members.students, profiles)
	};
}

export type RosterResult =
	| { ok: true; id: string; members: { teachers: string[]; students: string[] } }
	| { ok: false; id: string; error: string };

/**
 * Canonical multi-course roster fan-out: parallel member reads, single
 * profile write, per-course degradation. `overview` and any future bulk
 * roster path go through here instead of reimplementing the partition loop.
 */
export async function fetchManyCoursePeople(
	session: WebSession,
	courseIds: string[]
): Promise<{
	teachersByCourse: Map<string, (RawTeacher & { name: string })[]>;
	errors: Record<string, string>;
}> {
	const tokens = await sessionTokens(session);
	const jar = sessionJar(session);
	const rosters: RosterResult[] = await Promise.all(
		courseIds.map(async (id): Promise<RosterResult> => {
			try {
				const members = await fetchCourseMembers(jar, session.authuser, tokens, id);
				return { ok: true, id, members };
			} catch (err) {
				return { ok: false, id, error: err instanceof Error ? err.message : String(err) };
			}
		})
	);
	const errors: Record<string, string> = {};
	const memberIds = new Set<string>();
	const pending: Extract<RosterResult, { ok: true }>[] = [];
	for (const r of rosters) {
		if (!r.ok) {
			errors[`teachers:${r.id}`] = r.error;
			continue;
		}
		pending.push(r);
		for (const pid of [...r.members.teachers, ...r.members.students]) memberIds.add(pid);
	}
	const profiles = await ensureProfiles(session, [...memberIds]);
	const teachersByCourse = new Map<string, (RawTeacher & { name: string })[]>();
	for (const r of pending) teachersByCourse.set(r.id, namedTeachers(r.members.teachers, profiles));
	return { teachersByCourse, errors };
}
