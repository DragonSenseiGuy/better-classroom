import {
	SessionError,
	fetchStreamPage,
	loadTokens,
	type RawCapture,
	type StreamItem,
	type WebTokens
} from './classroom-web';
import {
	findPost,
	getProfile,
	getRichStatus,
	getWebSession,
	listAll,
	listByCourse,
	saveRichStatus,
	setPostHtml,
	type WebSession
} from './store';
import type { Change, CollectionName, RichStatus } from '#lib/shared/types.ts';

const PAGE_SIZE = 50;
const MAX_PAGES = 60;
const TOKEN_TTL = 20 * 60_000;

let cached: { key: string; tokens: WebTokens; at: number } | null = null;

async function tokensFor(session: WebSession, fresh = false) {
	const key = `${session.authuser}:${session.cookie.length}:${session.savedAt}`;
	if (!fresh && cached && cached.key === key && Date.now() - cached.at < TOKEN_TTL)
		return cached.tokens;
	const tokens = await loadTokens(session.cookie, session.authuser);
	cached = { key, tokens, at: Date.now() };
	return tokens;
}

export type Publish = (collection: CollectionName, changes: Change[]) => void;

export function applyStreamItems(items: StreamItem[], publish: Publish) {
	const grouped: Record<string, Change[]> = {};
	let updated = 0;
	for (const item of items) {
		if (!item.html) continue;
		const found = findPost(item.id);
		if (!found) continue;
		const change = setPostHtml(found.table, found.row, item.html);
		if (!change) continue;
		(grouped[found.table] ??= []).push(change);
		updated++;
	}
	for (const [table, changes] of Object.entries(grouped)) publish(table as CollectionName, changes);
	return updated;
}

export async function syncRichText(
	options: { full?: boolean },
	publish: Publish
): Promise<RichStatus | null> {
	const session = getWebSession();
	if (!session) return null;
	const previous = getRichStatus();
	if (previous && !previous.ok && previous.expired && previous.sessionSavedAt === session.savedAt)
		return previous;
	const status = await walk(session, options.full === true, publish);
	saveRichStatus(status);
	return status;
}

async function walk(session: WebSession, full: boolean, publish: Publish): Promise<RichStatus> {
	let updated = 0;
	const errors: string[] = [];
	let tokens: WebTokens;
	try {
		tokens = await tokensFor(session);
	} catch (err) {
		return failure(err, session);
	}
	const courses = listAll('courses').filter((c) => !c.archived);
	for (const course of courses) {
		let token: string | undefined;
		let page = 0;
		try {
			do {
				let result;
				try {
					result = await fetchStreamPage(
						session.cookie,
						session.authuser,
						tokens,
						course.id,
						PAGE_SIZE,
						token
					);
				} catch (err) {
					if (err instanceof SessionError && page === 0 && course === courses[0]) {
						tokens = await tokensFor(session, true);
						result = await fetchStreamPage(
							session.cookie,
							session.authuser,
							tokens,
							course.id,
							PAGE_SIZE,
							token
						);
					} else throw err;
				}
				const changed = applyStreamItems(result.items, publish);
				updated += changed;
				token = result.hasMore ? result.token : undefined;
				page++;
				if (!full && changed === 0) break;
			} while (token && page < MAX_PAGES);
		} catch (err) {
			if (err instanceof SessionError) return failure(err, session);
			errors.push(`${course.name}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}
	return {
		ok: errors.length === 0,
		message: errors.length ? errors.join('\n') : undefined,
		at: Date.now(),
		updated
	};
}

function failure(err: unknown, session: WebSession): RichStatus {
	const expired = err instanceof SessionError;
	return {
		ok: false,
		message: expired
			? `Classroom session no longer works: ${err.message} Paste a fresh cookie in Settings.`
			: err instanceof Error
				? err.message
				: String(err),
		at: Date.now(),
		expired,
		sessionSavedAt: session.savedAt
	};
}

export type ProbeAttempt = {
	authuser: number;
	email?: string;
	error?: string;
	courses: { id: string; name: string; items: number; raw?: RawCapture }[];
};

export type ProbeResult =
	| { ok: true; authuser: number; sample: number; attempts: ProbeAttempt[] }
	| { ok: false; message: string; attempts: ProbeAttempt[] };

export async function probeSession(cookie: string): Promise<ProbeResult> {
	const courses = listAll('courses').filter((c) => !c.archived);
	const attempts: ProbeAttempt[] = [];
	if (courses.length === 0)
		return {
			ok: false,
			message: 'Sync your courses first, then add the Classroom session.',
			attempts
		};
	const me = getProfile()?.email?.toLowerCase();
	const sample = courses
		.map((c) => ({ c, n: listByCourse('announcements', c.id).length }))
		.sort((a, b) => b.n - a.n)
		.slice(0, 3)
		.map((x) => x.c);
	for (let authuser = 0; authuser < 5; authuser++) {
		const attempt: ProbeAttempt = { authuser, courses: [] };
		attempts.push(attempt);
		let tokens: WebTokens;
		try {
			tokens = await loadTokens(cookie, authuser);
		} catch (err) {
			attempt.error = err instanceof Error ? err.message : String(err);
			if (attempt.error.includes('redirected to')) break;
			continue;
		}
		attempt.email = tokens.email;
		if (me && tokens.email && tokens.email.toLowerCase() !== me) continue;
		let found = 0;
		for (const course of sample) {
			const raw: RawCapture[] = [];
			try {
				const page = await fetchStreamPage(cookie, authuser, tokens, course.id, 10, undefined, raw);
				attempt.courses.push({
					id: course.id,
					name: course.name,
					items: page.items.length,
					raw: raw[0]
				});
				found += page.items.length;
				if (found > 0) break;
			} catch (err) {
				attempt.error = err instanceof Error ? err.message : String(err);
				attempt.courses.push({ id: course.id, name: course.name, items: 0, raw: raw[0] });
				break;
			}
		}
		if (found > 0) return { ok: true, authuser, sample: found, attempts };
	}
	const seen = attempts.filter((a) => a.email).map((a) => `/u/${a.authuser}/ = ${a.email}`);
	return {
		ok: false,
		message: me
			? `None of the signed-in accounts (${seen.join(', ') || 'none found'}) could load posts as ${me}.`
			: `No signed-in account in that cookie could load posts (${seen.join(', ') || 'none found'}).`,
		attempts
	};
}
