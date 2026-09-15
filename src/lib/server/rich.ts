import {
	SessionError,
	fetchCourseMembers,
	fetchProfiles,
	fetchStreamPage,
	loadTokens,
	refreshSession,
	rotateSession,
	listComments,
	querySubmissionAttachments,
	uploadToDrive,
	writeAttachments,
	writeComment,
	writeSubmissionState,
	type CookieJar,
	type WebComment,
	type RawCapture,
	type StreamItem,
	type WebTokens
} from './classroom-web';
import { warmAvatars } from './avatars';
import {
	findPost,
	getKeepAlive,
	getProfile,
	getRichStatus,
	getWebProfiles,
	getWebSession,
	listAll,
	listByCourse,
	saveKeepAlive,
	saveRichStatus,
	saveWebProfiles,
	saveWebSession,
	setCourseStudents,
	setPostExtras,
	type WebSession
} from './store';
import type { Provider, Publish } from './providers';
import type {
	Author,
	Change,
	CollectionName,
	Comment,
	RichStatus,
	SubmissionFile
} from '#lib/shared/types.ts';

const PAGE_SIZE = 50;
const MAX_PAGES = 60;
const TOKEN_TTL = 20 * 60_000;
const PROFILE_BATCH = 25;

let cached: { key: string; tokens: WebTokens; at: number } | null = null;

// One jar per pasted cookie. The keep-alive timer and the sync walk run on
// their own schedules; separate jars would each write their own copy of the
// cookie back and could overwrite a freshly rotated device-session token
// with the value it replaced.
let shared: { savedAt: number; jar: CookieJar } | null = null;

function jarFor(session: WebSession): CookieJar {
	if (shared?.savedAt !== session.savedAt)
		shared = {
			savedAt: session.savedAt,
			jar: {
				cookie: session.cookie,
				onChange: (cookie) => saveWebSession({ ...session, cookie })
			}
		};
	return shared.jar;
}

async function tokensFor(session: WebSession, jar: CookieJar, fresh = false) {
	const key = `${session.authuser}:${session.savedAt}`;
	if (!fresh && cached && cached.key === key && Date.now() - cached.at < TOKEN_TTL)
		return cached.tokens;
	await rotateIfDue(jar);
	const tokens = await loadTokens(jar, session.authuser);
	saveKeepAlive({ ...getKeepAlive(), refreshedAt: Date.now() });
	cached = { key, tokens, at: Date.now() };
	return tokens;
}

let rotating: Promise<void> | null = null;

function rotateIfDue(jar: CookieJar): Promise<void> {
	if (rotating) return rotating;
	const state = getKeepAlive();
	if (Date.now() < (state.nextRotateAt ?? 0)) return Promise.resolve();
	rotating = rotateSession(jar)
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
			rotating = null;
		});
	return rotating;
}

/**
 * Periodic keep-alive; the scheduler calls this between syncs. Rotates the
 * device-session cookies on the cadence Google reports (10 minutes) and
 * refreshes the short-lived ones with a page fetch.
 */
export async function refreshSavedSession(): Promise<RichStatus | null> {
	const session = getWebSession();
	if (!session) return null;
	const previous = getRichStatus();
	if (previous && !previous.ok && previous.expired && previous.sessionSavedAt === session.savedAt)
		return previous;
	try {
		const jar = jarFor(session);
		await rotateIfDue(jar);
		if (Date.now() - (getKeepAlive().refreshedAt ?? 0) >= 10 * 60_000) {
			await refreshSession(jar, session.authuser);
			saveKeepAlive({ ...getKeepAlive(), refreshedAt: Date.now() });
		}
		return previous;
	} catch (err) {
		const status = failure(err, session);
		if (status.expired) saveRichStatus(status);
		return status;
	}
}

type Ctx = {
	session: WebSession;
	jar: CookieJar;
	tokens: WebTokens;
	profiles: Record<string, Author>;
	publish: Publish;
};

async function resolveAuthors(ctx: Ctx, ids: string[]) {
	const missing = [...new Set(ids)].filter((id) => !(id in ctx.profiles));
	for (let i = 0; i < missing.length; i += PROFILE_BATCH) {
		const batch = missing.slice(i, i + PROFILE_BATCH);
		const found = await fetchProfiles(ctx.jar, ctx.session.authuser, ctx.tokens, batch);
		for (const p of found)
			ctx.profiles[p.id] = { name: p.name, email: p.email, photoUrl: p.photoUrl };
		for (const id of batch) ctx.profiles[id] ??= {};
		void warmAvatars(found.map((p) => p.photoUrl));
	}
	if (missing.length) saveWebProfiles(ctx.profiles);
}

async function applyStreamItems(ctx: Ctx, items: StreamItem[]) {
	await resolveAuthors(
		ctx,
		items.map((i) => i.creatorId).filter((id): id is string => Boolean(id))
	);
	const grouped: Record<string, Change[]> = {};
	let updated = 0;
	for (const item of items) {
		const found = findPost(item.id);
		if (!found) continue;
		const author = item.creatorId ? ctx.profiles[item.creatorId] : undefined;
		const change = setPostExtras(found.table, found.row, {
			html: item.html,
			author: author && author.name ? author : undefined
		});
		if (!change) continue;
		(grouped[found.table] ??= []).push(change);
		updated++;
	}
	for (const [table, changes] of Object.entries(grouped))
		ctx.publish(table as CollectionName, changes);
	return updated;
}

async function syncClassmates(ctx: Ctx, courseId: string) {
	const members = await fetchCourseMembers(ctx.jar, ctx.session.authuser, ctx.tokens, courseId);
	await resolveAuthors(ctx, [...members.students, ...members.teachers]);
	const students = members.students
		.map((id) => ctx.profiles[id])
		.filter((p): p is Author => Boolean(p && p.name))
		.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
	const change = setCourseStudents(courseId, students, members.students.length);
	if (change) ctx.publish('courses', [change]);
	return Boolean(change);
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
	const jar = jarFor(session);
	let tokens: WebTokens;
	try {
		tokens = await tokensFor(session, jar);
	} catch (err) {
		return failure(err, session);
	}
	const ctx: Ctx = { session, jar, tokens, profiles: getWebProfiles(), publish };
	const courses = listAll('courses').filter((c) => !c.archived);
	for (const course of courses) {
		let token: string | undefined;
		let page = 0;
		try {
			if (full || course.students === undefined) {
				const changed = await syncClassmates(ctx, course.id);
				if (changed) updated++;
			}
			do {
				let result;
				try {
					result = await fetchStreamPage(
						jar,
						session.authuser,
						ctx.tokens,
						course.id,
						PAGE_SIZE,
						token
					);
				} catch (err) {
					if (err instanceof SessionError && page === 0 && course === courses[0]) {
						ctx.tokens = await tokensFor(session, jar, true);
						result = await fetchStreamPage(
							jar,
							session.authuser,
							ctx.tokens,
							course.id,
							PAGE_SIZE,
							token
						);
					} else throw err;
				}
				const changed = await applyStreamItems(ctx, result.items);
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

export const webProvider: Provider = {
	status: () => {
		const session = getWebSession();
		const status = getRichStatus();
		const keepAlive = getKeepAlive();
		const keptAliveAt = Math.max(keepAlive.rotatedAt ?? 0, keepAlive.refreshedAt ?? 0);
		const failed = session && status && !status.ok;
		return {
			id: 'web',
			label: 'Classroom session',
			role: 'enrichment',
			state: !session ? 'off' : failed ? (status.expired ? 'expired' : 'error') : 'ready',
			active: false,
			detail: !session
				? 'No cookie saved.'
				: failed
					? status.message
					: keptAliveAt
						? `Kept alive ${Math.round((Date.now() - keptAliveAt) / 60_000)} min ago.`
						: 'Cookie saved.'
		};
	},
	enrich: {
		enrich: syncRichText,
		keepAlive: refreshSavedSession,
		submissionAction,
		comments: { list: listWebComments, post: postWebComment, remove: removeWebComment },
		attachments: { list: listWebFiles, upload: uploadWebFile, remove: removeWebFile }
	}
};

async function listWebFiles(courseId: string, workId: string): Promise<SubmissionFile[]> {
	const { session, jar, tokens } = await webContext();
	return querySubmissionAttachments(jar, session.authuser, tokens, workId, courseId);
}

async function uploadWebFile(
	courseId: string,
	workId: string,
	file: { name: string; type: string; bytes: Uint8Array }
): Promise<SubmissionFile[]> {
	const { session, studentId, jar, tokens } = await webContext();
	const a = session.authuser;
	const current = await querySubmissionAttachments(jar, a, tokens, workId, courseId);
	const { id } = await uploadToDrive(jar, a, file);
	await writeAttachments(jar, a, tokens, studentId, workId, courseId, [
		...current,
		{ driveId: id, mime: file.type }
	]);
	const after = await querySubmissionAttachments(jar, a, tokens, workId, courseId);
	if (!after.some((f) => f.driveId === id))
		throw new Error('Classroom did not accept the file. Unsubmit first if the work is turned in.');
	return after;
}

async function removeWebFile(
	courseId: string,
	workId: string,
	driveId: string
): Promise<SubmissionFile[]> {
	const { session, studentId, jar, tokens } = await webContext();
	const a = session.authuser;
	const current = await querySubmissionAttachments(jar, a, tokens, workId, courseId);
	if (!current.some((f) => f.driveId === driveId)) throw new Error('That file is no longer attached.');
	const remaining = current.filter((f) => f.driveId !== driveId);
	await writeAttachments(jar, a, tokens, studentId, workId, courseId, remaining);
	const after = await querySubmissionAttachments(jar, a, tokens, workId, courseId);
	if (after.some((f) => f.driveId === driveId))
		throw new Error('Classroom did not remove the file. Unsubmit first if the work is turned in.');
	return after;
}

async function webContext() {
	const session = getWebSession();
	if (!session) throw new Error('No Classroom session saved.');
	const studentId = myWebId();
	if (!studentId) throw new Error('Your Classroom web id is not known yet; run a sync first.');
	const jar = jarFor(session);
	const tokens = await tokensFor(session, jar);
	return { session, studentId, jar, tokens };
}

function shapeComment(c: WebComment, studentId: string): Comment {
	const profile = getWebProfiles()[c.authorId];
	return {
		id: c.id,
		authorId: c.authorId,
		author: profile && profile.name ? profile : undefined,
		mine: c.authorId === studentId,
		text: c.text,
		html: c.html,
		createdAt: c.createdAt
	};
}

async function listWebComments(courseId: string, workId: string): Promise<Comment[]> {
	const { session, studentId, jar, tokens } = await webContext();
	const found = await listComments(jar, session.authuser, tokens, studentId, workId, courseId);
	const missing = found.map((c) => c.authorId).filter((id) => id && !(id in getWebProfiles()));
	if (missing.length) {
		const ctx: Ctx = { session, jar, tokens, profiles: getWebProfiles(), publish: () => {} };
		await resolveAuthors(ctx, missing);
	}
	return found.map((c) => shapeComment(c, studentId));
}

async function postWebComment(courseId: string, workId: string, text: string) {
	const { session, studentId, jar, tokens } = await webContext();
	const created = await writeComment(
		'create',
		jar,
		session.authuser,
		tokens,
		studentId,
		workId,
		courseId,
		text
	);
	return created ? shapeComment(created, studentId) : null;
}

async function removeWebComment(courseId: string, workId: string, commentId: string) {
	const { session, studentId, jar, tokens } = await webContext();
	await writeComment(
		'delete',
		jar,
		session.authuser,
		tokens,
		studentId,
		workId,
		courseId,
		'',
		commentId
	);
}

/** The signed-in student's web-side id, matched by email among synced profiles. */
function myWebId(): string | null {
	const email = getProfile()?.email?.toLowerCase();
	if (!email) return null;
	for (const [id, p] of Object.entries(getWebProfiles()))
		if (p.email?.toLowerCase() === email) return id;
	return null;
}

async function submissionAction(
	action: 'turnIn' | 'reclaim',
	courseId: string,
	workId: string
): Promise<{ turnedIn: boolean }> {
	const session = getWebSession();
	if (!session) throw new Error('No Classroom session saved.');
	const studentId = myWebId();
	if (!studentId) throw new Error('Your Classroom web id is not known yet; run a sync first.');
	const jar = jarFor(session);
	const tokens = await tokensFor(session, jar);
	const result = await writeSubmissionState(
		action,
		jar,
		session.authuser,
		tokens,
		studentId,
		workId,
		courseId
	);
	return { turnedIn: result.turnedIn };
}

export type ProbeAttempt = {
	authuser: number;
	email?: string;
	error?: string;
	courses: { id: string; name: string; items: number; raw?: RawCapture }[];
};

export type ProbeResult =
	| { ok: true; authuser: number; sample: number; cookie: string; attempts: ProbeAttempt[] }
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
	const jar: CookieJar = { cookie };
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
			tokens = await loadTokens(jar, authuser);
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
				const page = await fetchStreamPage(jar, authuser, tokens, course.id, 10, undefined, raw);
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
		if (found > 0) return { ok: true, authuser, sample: found, cookie: jar.cookie, attempts };
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
