// Cookie probes: verify a pasted cookie can load Classroom before saving it.
//
// Separate from web-session.ts on purpose. Probes use a throwaway jar and
// never touch the token cache, rotation state, or profile store — they run
// before any session exists. Session caching lives in web-session.ts.

import {
	fetchHomeHtml,
	fetchStreamPage,
	isSlotExhausted,
	parseTokens,
	type CookieJar,
	type RawCapture,
	type WebTokens
} from './classroom-web';
import { parseCoursesHtml, describeHomeHtml, type HomeDiag } from './course-discovery';
import { errorMessage } from './http';
import { getProfile, listAll, listByCourse } from './store';

export type ProbeError = { ok: false; code: 'cookie' | 'probe' | 'state'; message: string };

/** Pasted-cookie validation failure; carries its own code so routes never cast. */
export class CookieError extends Error {
	readonly code = 'cookie' as const;
}

const MAX_AUTHUSER_SLOTS = 5;

/**
 * Canonical validation for a pasted Cookie header. Both session routes share
 * it so SID/SAPISID requirements and `Cookie:` prefix stripping never drift.
 */
export function parsePastedCookie(value: unknown): string {
	if (typeof value !== 'string')
		throw new CookieError('Paste the whole Cookie header. It should include SID and SAPISID.');
	// Strip the header-name prefix before validating: DevTools copies it as
	// `Cookie: SID=…`, and the SID check below would otherwise reject it.
	const cookie = value.replace(/^cookie:\s*/i, '').trim();
	if (!/(^|;\s*)SID=/.test(cookie))
		throw new CookieError('Paste the whole Cookie header. It should include SID and SAPISID.');
	return cookie;
}

export function probeErrorMessage(err: unknown): ProbeError {
	if (err instanceof CookieError) return { ok: false, code: 'cookie', message: err.message };
	return { ok: false, code: 'probe', message: errorMessage(err) };
}

export type SlotProbe = {
	authuser: number;
	tokens?: WebTokens;
	email?: string;
	html?: string;
	path?: string;
	diag?: HomeDiag;
	courseCount?: number;
	error?: string;
};

/** Enumerates account slots 0..maxSlots with a pasted cookie. Shared by both probes. */
async function listSlots(
	cookie: string,
	maxSlots = MAX_AUTHUSER_SLOTS
): Promise<{ jar: CookieJar; slots: SlotProbe[] }> {
	const jar: CookieJar = { cookie };
	const slots: SlotProbe[] = [];
	for (let authuser = 0; authuser < maxSlots; authuser++) {
		try {
			const { html, path } = await fetchHomeHtml(jar, authuser);
			const tokens = parseTokens(html);
			slots.push({ authuser, tokens, email: tokens.email, html, path, diag: describeHomeHtml(html) });
		} catch (err) {
			slots.push({ authuser, error: errorMessage(err) });
			if (isSlotExhausted(err)) break;
		}
	}
	return { jar, slots };
}

/**
 * Pure pick: prefer the first slot that actually lists courses. Keeps the
 * network enumeration above separate so this choice is unit-testable.
 */
export function chooseSlotWithCourses(slots: SlotProbe[]): SlotProbe | undefined {
	let fallback: SlotProbe | undefined;
	for (const slot of slots) {
		if (slot.error || !slot.tokens) continue;
		fallback ??= slot;
		const count = slot.html ? parseCoursesHtml(slot.html).length : 0;
		slot.courseCount = count;
		if (count > 0) return slot;
	}
	return fallback;
}

/**
 * Setup-path probe: verifies a pasted cookie loads Classroom without needing
 * synced courses. Tries account slots and keeps the first that lists courses
 * (not just the first signed-in slot: with multi-login the personal /u/0
 * slot usually signs in fine but holds no courses, which used to surface
 * later as "no courses were found on the Classroom home page").
 */
export async function probeSessionBase(
	cookie: string
): Promise<
	| { ok: true; authuser: number; email?: string; cookie: string; courseCount: number; code?: undefined }
	| { ok: false; message: string; code: string }
> {
	const { jar, slots } = await listSlots(cookie);
	const hit = chooseSlotWithCourses(slots);
	if (hit?.tokens) {
		const courseCount = hit.courseCount ?? 0;
		if (courseCount > 0)
			return { ok: true, authuser: hit.authuser, email: hit.email, cookie: jar.cookie, courseCount };
		const fmt = (s: SlotProbe) => {
			const d = s.diag;
			const shape = d
				? `${Math.round(d.bytes / 1024)}KB links:${d.courseLinks} pairs:${d.idPairs} init:${d.initData}`
				: 'unparsed';
			return `/u/${s.authuser}/ = ${s.email} (${s.courseCount ?? 0} courses, ${s.path ?? 'unknown path'}, ${shape})`;
		};
		const seen = slots.filter((s) => s.email).map(fmt);
		return {
			ok: false,
			code: 'cookie',
			message:
				`Signed in${hit.email ? ` as ${hit.email}` : ''}, but no courses were found on the Classroom ` +
				`home page (checked ${seen.join(', ') || 'no signed-in slots'}). ` +
				`If your courses live on a school account, paste a cookie from a window signed in ` +
				`with only that account, or report this line if courses are visible there.`
		};
	}
	return {
		ok: false,
		code: 'cookie',
		message: slots.at(-1)?.error ?? 'No signed-in Google account found in that cookie.'
	};
}

/**
 * Samples one stream page per course until a slot proves it can load posts.
 * Single-page reads only: this is a connectivity check, not a sync.
 */
export type ProbeAttempt = {
	authuser: number;
	email?: string;
	error?: string;
	courses: { id: string; name: string; items: number; raw?: RawCapture }[];
};

async function sampleSlot(
	jar: CookieJar,
	slot: SlotProbe & { tokens: WebTokens },
	courses: { id: string; name: string }[]
): Promise<{ ok: boolean; sample: number; courses: ProbeAttempt['courses']; error?: string }> {
	const sampled: ProbeAttempt['courses'] = [];
	let firstError: string | undefined;
	for (const course of courses) {
		const raw: RawCapture[] = [];
		try {
			const page = await fetchStreamPage(
				jar,
				slot.authuser,
				slot.tokens,
				course.id,
				10,
				undefined,
				raw
			);
			sampled.push({ id: course.id, name: course.name, items: page.items.length, raw: raw[0] });
			if (page.items.length > 0) return { ok: true, sample: page.items.length, courses: sampled };
		} catch (err) {
			sampled.push({ id: course.id, name: course.name, items: 0, raw: raw[0] });
			// A single course can fail while the slot is fine (e.g. an
			// archived or inaccessible course), so keep sampling the rest
			// and report the first error only if nothing loads.
			firstError ??= errorMessage(err);
			continue;
		}
	}
	return { ok: false, sample: 0, courses: sampled, error: firstError };
}

export type ProbeResult =
	| { ok: true; authuser: number; sample: number; cookie: string; attempts: ProbeAttempt[] }
	| ({ ok: false; code: 'probe' | 'state'; attempts: ProbeAttempt[] } & { message: string });

/**
 * Single coercion point for "safe to log/return" probe results. Both probe
 * endpoints persist the cookie server-side and must never echo it back to
 * the client or into stored meta — strip it here instead of repeating the
 * destructure per route.
 */
export function withoutCookie<T extends { cookie?: string }>(result: T): Omit<T, 'cookie'> {
	const safe = { ...result };
	delete safe.cookie;
	return safe;
}

/**
 * Debug RPC captures (`raw` 600-char heads) prove connectivity but must never
 * leave the server: strip them before persisting to meta or returning to the
 * client. `withoutCookie` only strips the cookie.
 */
export function sanitizeProbeAttempts(attempts: ProbeAttempt[]): ProbeAttempt[] {
	return attempts.map((a) => ({
		...a,
		courses: a.courses.map(({ raw: _omitted, ...rest }) => rest)
	}));
}

/**
 * Settings-path probe: matches the cookie's account slots against already
 * synced courses (and the app profile email), sampling stream pages to prove
 * a slot can actually load posts.
 */
export async function probeSession(cookie: string): Promise<ProbeResult> {
	const courses = listAll('courses').filter((c) => !c.archived);
	const attempts: ProbeAttempt[] = [];
	if (courses.length === 0)
		return {
			ok: false,
			code: 'state',
			message: 'Sync your courses first, then add the Classroom session.',
			attempts
		};
	const me = getProfile()?.email?.toLowerCase();
	const { jar, slots } = await listSlots(cookie);
	const sample = courses
		.map((c) => ({ c, n: listByCourse('announcements', c.id).length }))
		.sort((a, b) => b.n - a.n)
		.slice(0, 3)
		.map((x) => x.c);
	for (const slot of slots) {
		const attempt: ProbeAttempt = { authuser: slot.authuser, courses: [] };
		attempts.push(attempt);
		if (!slot.tokens) {
			attempt.error = slot.error;
			continue;
		}
		attempt.email = slot.email;
		if (!slot.tokens.email) {
			attempt.error = 'That account slot exposed no email; skipping.';
			continue;
		}
		if (me && slot.tokens.email.toLowerCase() !== me) continue;
		const result = await sampleSlot(jar, slot as SlotProbe & { tokens: WebTokens }, sample);
		attempt.courses.push(...result.courses);
		if (result.error) attempt.error = result.error;
		if (result.ok)
			return {
				ok: true,
				authuser: slot.authuser,
				sample: result.sample,
				cookie: jar.cookie,
				attempts
			};
	}
	const seen = attempts.filter((a) => a.email).map((a) => `/u/${a.authuser}/ = ${a.email}`);
	return {
		ok: false,
		code: 'probe',
		message: me
			? `None of the signed-in accounts (${seen.join(', ') || 'none found'}) could load posts as ${me}.`
			: `No signed-in account in that cookie could load posts (${seen.join(', ') || 'none found'}).`,
		attempts
	};
}
