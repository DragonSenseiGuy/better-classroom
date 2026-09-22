import {
	SessionError,
	refreshSession,
	listComments,
	querySubmissionAttachments,
	uploadToDrive,
	writeAttachments,
	writeComment,
	writeSubmissionState,
	type WebComment,
	type StreamItem
} from './classroom-web';
import {
	ensureProfiles,
	ensureRotated,
	fetchCoursePeople,
	iterateCourseStream,
	sessionJar,
	toAuthor,
	withWebStudent
} from './web-session';
import { errorMessage } from './http';
import { isVisible } from '#lib/course.ts';
import {
	findPost,
	getKeepAlive,
	getRichStatus,
	getWebProfiles,
	getWebSession,
	listAll,
	saveKeepAlive,
	saveRichStatus,
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
		await ensureRotated(session);
		if (Date.now() - (getKeepAlive().refreshedAt ?? 0) >= 10 * 60_000) {
			await refreshSession(sessionJar(session), session.authuser);
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
	publish: Publish;
};

async function applyStreamItems(ctx: Ctx, items: StreamItem[]) {
	const profiles = await ensureProfiles(
		ctx.session,
		items.map((i) => i.creatorId).filter((id): id is string => Boolean(id))
	);
	const grouped: Record<string, Change[]> = {};
	let updated = 0;
	for (const item of items) {
		const found = findPost(item.id);
		if (!found) continue;
		const author = item.creatorId ? profiles[item.creatorId] : undefined;
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
	// fetchCoursePeople already returns named teachers only; no second filter.
	const people = await fetchCoursePeople(ctx.session, courseId);
	const students: Author[] = people.students
		.map((s) => toAuthor(s))
		.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
	const change = setCourseStudents(courseId, students, people.students.length);
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
	const ctx: Ctx = { session, publish };
	const courses = listAll('courses').filter(isVisible);
	for (const course of courses) {
		try {
			if (full || course.students === undefined) {
				const changed = await syncClassmates(ctx, course.id);
				if (changed) updated++;
			}
			updated += await syncCourseStream(ctx, course.id, full);
		} catch (err) {
			if (err instanceof SessionError) return failure(err, session);
			errors.push(`${course.name}: ${errorMessage(err)}`);
		}
	}
	return {
		ok: errors.length === 0,
		message: errors.length ? errors.join('\n') : undefined,
		at: Date.now(),
		updated
	};
}

/** Walks one course stream; the session-owned iterator stops at the last page. */
async function syncCourseStream(ctx: Ctx, courseId: string, full: boolean): Promise<number> {
	let updated = 0;
	for await (const result of iterateCourseStream(ctx.session, courseId)) {
		const changed = await applyStreamItems(ctx, result.items);
		updated += changed;
		if (!full && changed === 0) break;
	}
	return updated;
}

function failure(err: unknown, session: WebSession): RichStatus {
	const expired = err instanceof SessionError;
	return {
		ok: false,
		message: expired
			? `Classroom session no longer works: ${err.message} Paste a fresh cookie in Settings.`
			: errorMessage(err),
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
	const { session, jar, tokens } = await withWebStudent();
	return querySubmissionAttachments(jar, session.authuser, tokens, workId, courseId);
}

async function uploadWebFile(
	courseId: string,
	workId: string,
	file: { name: string; type: string; bytes: Uint8Array }
): Promise<SubmissionFile[]> {
	const { session, studentId, jar, tokens } = await withWebStudent();
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
	const { session, studentId, jar, tokens } = await withWebStudent();
	const a = session.authuser;
	const current = await querySubmissionAttachments(jar, a, tokens, workId, courseId);
	if (!current.some((f) => f.driveId === driveId))
		throw new Error('That file is no longer attached.');
	const remaining = current.filter((f) => f.driveId !== driveId);
	await writeAttachments(jar, a, tokens, studentId, workId, courseId, remaining);
	const after = await querySubmissionAttachments(jar, a, tokens, workId, courseId);
	if (after.some((f) => f.driveId === driveId))
		throw new Error('Classroom did not remove the file. Unsubmit first if the work is turned in.');
	return after;
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
	const { session, studentId, jar, tokens } = await withWebStudent();
	const found = await listComments(jar, session.authuser, tokens, studentId, workId, courseId);
	await ensureProfiles(
		session,
		found.map((c) => c.authorId).filter((id): id is string => Boolean(id))
	);
	return found.map((c) => shapeComment(c, studentId));
}

async function postWebComment(courseId: string, workId: string, text: string) {
	const { session, studentId, jar, tokens } = await withWebStudent();
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
	const { session, studentId, jar, tokens } = await withWebStudent();
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

async function submissionAction(
	action: 'turnIn' | 'reclaim',
	courseId: string,
	workId: string
): Promise<{ turnedIn: boolean }> {
	const { session, studentId, jar, tokens } = await withWebStudent();
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
