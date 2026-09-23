import type { RawCourseContent, RawTeacher } from './providers';
import { warmAvatars } from './avatars';
import { config, isConfigured } from './config';
import { errorMessage } from './http';
import { broadcast } from './events';
import { rebuildSearchIndex } from './search';
import { pushConfigured, sendPush } from './push';
import { notifyPayloads } from '#lib/shared/notify.ts';
import { isArchived } from '#lib/course.ts';
import { enrichers, recordSource } from './providers';
import {
	applyContent,
	applyCourses,
	clearCourseContent,
	getCourse,
	getMeta,
	getSyncStatus,
	hideCourse,
	listAll,
	listByCourse,
	mergeCoursePeople,
	saveSyncStatus,
	setMeta,
	setProfile,
	setCoursePrefs,
	setDismissed,
	touchCourseSynced,
	CONTENT_TABLE_LIST,
	type ContentTable,
	type CoursePrefs
} from './store';
import { listUserIds } from './db';
import { perUser, runAs } from './tenant';
import { dueAt, ms } from './time';
import type { Attachment, Change, CollectionName, SyncStatus, Teacher } from '#lib/shared/types.ts';
import { handInBlocker } from '#lib/shared/hand-in.ts';

type UserSync = {
	state: SyncStatus;
	running: Promise<void> | null;
	queuedFull: boolean;
	backoffMinutes: number;
	nextRunAt: number;
	richRunning: Promise<void> | null;
};

const users = perUser<UserSync>(() => ({
	state: getSyncStatus(),
	running: null,
	queuedFull: false,
	backoffMinutes: 0,
	nextRunAt: 0,
	richRunning: null
}));

export const syncStatus = () => users().state;

function setState(patch: Partial<SyncStatus>) {
	const u = users();
	u.state = {
		...u.state,
		...patch,
		configured: isConfigured(),
		intervalMinutes: config.syncIntervalMinutes
	};
	saveSyncStatus(u.state);
	broadcast({ type: 'sync', sync: u.state });
}

function publish(collection: CollectionName, changes: Change[], opts?: { silent?: boolean }) {
	if (changes.length === 0) return;
	const u = users();
	u.state = { ...u.state, version: u.state.version + 1 };
	broadcast({ type: 'changes', version: u.state.version, collection, changes });
	// On-demand backfills re-insert old work the user already saw in
	// Classroom; notifying for those would spam "new assignment" pushes.
	if (opts?.silent) return;
	// The first sync inserts the whole backlog one course at a time; pushing that
	// would be dozens of notifications for work the user has already seen.
	if (!pushConfigured() || !u.state.syncedAt) return;
	const payloads = notifyPayloads(collection, changes, (id) => getCourse(id) ?? undefined);
	if (payloads.length) void sendPush(payloads);
}

export function runSync(options: { full?: boolean } = {}): Promise<void> {
	const u = users();
	if (u.running) {
		if (options.full) u.queuedFull = true;
		return u.running;
	}
	u.running = doSync(options).finally(() => {
		u.running = null;
		u.nextRunAt =
			Date.now() + Math.max(u.backoffMinutes, Math.max(1, config.syncIntervalMinutes)) * 60_000;
		if (u.queuedFull) {
			u.queuedFull = false;
			void runSync({ full: true });
		}
	});
	return u.running;
}

const QUOTA = /quota|rate ?limit|429/i;

async function doSync(options: { full?: boolean }) {
	const u = users();
	if (!isConfigured()) {
		setState({ status: 'idle', pending: 0 });
		return;
	}
	const lastFullAt = getMeta<number>('lastFullSyncAt') ?? 0;
	const full = options.full || Date.now() - lastFullAt > config.fullSyncHours * 3_600_000;
	const since = full ? 0 : Math.max(0, (getMeta<number>('lastSyncStartedAt') ?? 0) - 5 * 60_000);
	const startedAt = Date.now();
	setState({ status: 'running', startedAt, error: undefined, pending: 0 });
	try {
		const source = recordSource();
		const overview = await source.overview(since);
		setProfile({
			id: overview.profile.id,
			name: overview.profile.name ?? undefined,
			email: overview.profile.email ?? undefined,
			photoUrl: overview.profile.photoUrl ?? undefined
		});
		const courses = overview.courses.map((c) => ({
			id: c.id,
			name: c.name,
			section: c.section ?? undefined,
			descriptionHeading: c.descriptionHeading ?? undefined,
			description: c.description ?? undefined,
			room: c.room ?? undefined,
			ownerId: c.ownerId ?? undefined,
			courseState: c.courseState,
			alternateLink: c.alternateLink ?? undefined,
			calendarId: c.calendarId ?? undefined,
			createdAt: ms(c.creationTime),
			updatedAt: ms(c.updateTime),
			teachers: c.teachers?.map(person)
		}));
		publish('courses', applyCourses(courses));
		cullPreLazyContent();
		// True lazy: archived + hidden keep only the name row. Never fetch
		// their coursework/materials/submissions until opened on demand.
		// applyCourses just persisted hidden flags, so one listAll gives the
		// full picture without an N+1 getCourse per course.
		const hiddenById = new Map(listAll('courses').map((c) => [c.id, !!c.hidden]));
		const activeCourses = courses.filter(
			(c) => c.courseState !== 'ARCHIVED' && !hiddenById.get(c.id)
		);
		setState({ pending: activeCourses.length, courseCount: courses.length });
		void warmAvatars([
			overview.profile.photoUrl ?? undefined,
			...activeCourses.flatMap((c) => (c.teachers ?? []).map((t) => t.photoUrl))
		]);

		const errors: string[] = scriptErrors('Courses', overview.errors);
		const queue = [...activeCourses];
		const worker = async () => {
			for (let c = queue.shift(); c; c = queue.shift()) {
				try {
					const wantSubmissions = !since || listByCourse('courseWork', c.id).length > 0;
					const content = await source.courseContent(c.id, since, wantSubmissions);
					errors.push(...scriptErrors(c.name, content.errors));
					const unknown = applyCourseContent(c.id, content);
					if (unknown.users.length || unknown.topics)
						errors.push(...(await resolveUnknown(c.id, c.name, unknown.users)));
				} catch (err) {
					errors.push(`${c.name}: ${errorMessage(err)}`);
				}
				setState({ pending: Math.max(0, u.state.pending - 1) });
			}
		};
		await Promise.all(
			Array.from({ length: Math.min(config.syncConcurrency, queue.length) }, worker)
		);
		rebuildSearchIndex();
		if (errors.length === 0) {
			setMeta('lastSyncStartedAt', startedAt);
			if (full) setMeta('lastFullSyncAt', startedAt);
		}
		u.backoffMinutes = errors.some((e) => QUOTA.test(e))
			? Math.min(30, (u.backoffMinutes || config.syncIntervalMinutes) * 2)
			: 0;
		const finishedAt = Date.now();
		setState({
			status: errors.length ? 'error' : 'idle',
			error: errors.length ? errors.join('\n') : undefined,
			finishedAt,
			...(errors.length ? {} : { syncedAt: finishedAt }),
			pending: 0
		});
		void runRichSync({ full });
	} catch (err) {
		const message = errorMessage(err);
		u.backoffMinutes = QUOTA.test(message)
			? Math.min(30, (u.backoffMinutes || config.syncIntervalMinutes) * 2)
			: 0;
		setState({ status: 'error', error: message, finishedAt: Date.now(), pending: 0 });
	}
}

export function runRichSync(options: { full?: boolean } = {}): Promise<void> {
	const u = users();
	if (u.richRunning) return u.richRunning;
	u.richRunning = (async () => {
		for (const provider of enrichers())
			await provider.enrich
				.enrich(options, publish)
				.catch((err) => console.error('enrichment failed', err));
	})().finally(() => {
		u.richRunning = null;
	});
	return u.richRunning;
}

const clean = (a: Attachment) => ({
	type: a.type,
	title: a.title ?? undefined,
	url: a.url ?? undefined,
	thumbnailUrl: a.thumbnailUrl ?? undefined,
	shareMode: a.shareMode ?? undefined
});

export function shapeContent(courseId: string, raw: RawCourseContent) {
	return {
		courseWork: (raw.courseWork ?? []).map((w) => {
			const due = dueAt(w.dueDate, w.dueTime);
			return {
				id: w.id,
				courseId,
				title: w.title,
				description: w.description ?? undefined,
				materials: (w.materials ?? []).map(clean),
				alternateLink: w.alternateLink ?? undefined,
				createdAt: ms(w.creationTime),
				updatedAt: ms(w.updateTime),
				dueAt: due.dueAt,
				hasDueTime: due.hasDueTime,
				maxPoints: w.maxPoints ?? undefined,
				workType: w.workType ?? 'ASSIGNMENT',
				topicId: w.topicId ?? undefined,
				creatorUserId: w.creatorUserId ?? undefined
			};
		}),
		materials: (raw.materials ?? []).map((m) => ({
			id: m.id,
			courseId,
			title: m.title,
			description: m.description ?? undefined,
			materials: (m.materials ?? []).map(clean),
			alternateLink: m.alternateLink ?? undefined,
			createdAt: ms(m.creationTime),
			updatedAt: ms(m.updateTime),
			topicId: m.topicId ?? undefined,
			creatorUserId: m.creatorUserId ?? undefined
		})),
		announcements: (raw.announcements ?? []).map((a) => ({
			id: a.id,
			courseId,
			text: a.text ?? '',
			materials: (a.materials ?? []).map(clean),
			alternateLink: a.alternateLink ?? undefined,
			createdAt: ms(a.creationTime),
			updatedAt: ms(a.updateTime),
			creatorUserId: a.creatorUserId ?? undefined
		})),
		topics: (raw.topics ?? []).map((t) => ({
			id: t.id,
			courseId,
			name: t.name,
			updatedAt: ms(t.updateTime)
		})),
		submissions: (raw.submissions ?? []).map((s) => ({
			id: s.id,
			courseId,
			courseWorkId: s.courseWorkId,
			state: s.state,
			late: !!s.late,
			draftGrade: s.draftGrade ?? undefined,
			assignedGrade: s.assignedGrade ?? undefined,
			alternateLink: s.alternateLink ?? undefined,
			courseWorkType: s.courseWorkType ?? undefined,
			createdAt: s.creationTime ? ms(s.creationTime) : undefined,
			updatedAt: ms(s.updateTime),
			attachments: (s.attachments ?? []).map(clean)
		}))
	};
}

export function applyCourseContent(
	courseId: string,
	raw: RawCourseContent,
	opts?: { silent?: boolean }
) {
	const content = shapeContent(courseId, raw);
	const partial = raw.partial === true;
	for (const table of Object.keys(content) as ContentTable[]) {
		if (raw[table] === undefined) continue;
		const keepMissing = partial && table !== 'submissions';
		publish(table, applyContent(table, courseId, content[table], keepMissing), opts);
	}
	const touched = touchCourseSynced(courseId);
	if (touched) publish('courses', [touched], opts);
	return unknownReferences(courseId, content);
}

const person = (t: RawTeacher): Teacher => ({
	userId: t.userId,
	name: t.name ?? undefined,
	email: t.email ?? undefined,
	photoUrl: t.photoUrl ?? undefined
});

const scriptErrors = (label: string, errors?: Record<string, string>) =>
	Object.entries(errors ?? {}).map(([part, message]) => `${label} (${part}): ${message}`);

const LOOKUP_RETRY_MS = 24 * 3_600_000;

function unknownReferences(courseId: string, content: ReturnType<typeof shapeContent>) {
	const course = getCourse(courseId);
	const known = new Set(
		[...(course?.teachers ?? []), ...(course?.people ?? [])].map((p) => p.userId)
	);
	const tried = getMeta<Record<string, number>>(`lookupTried:${courseId}`) ?? {};
	const cutoff = Date.now() - LOOKUP_RETRY_MS;
	const users = new Set<string>();
	for (const item of [...content.courseWork, ...content.materials, ...content.announcements]) {
		const id = item.creatorUserId;
		if (id && !known.has(id) && (tried[id] ?? 0) < cutoff) users.add(id);
	}
	const topicIds = new Set(listByCourse('topics', courseId).map((t) => t.id));
	const topics = [...content.courseWork, ...content.materials].some(
		(item) => item.topicId && !topicIds.has(item.topicId)
	);
	return { users: [...users], topics };
}

async function resolveUnknown(
	courseId: string,
	name: string,
	users: string[],
	opts?: { silent?: boolean }
) {
	const found = await recordSource().lookup(courseId, users);
	const change = mergeCoursePeople(courseId, {
		teachers: found.teachers?.map(person),
		people: found.people?.map(person)
	});
	if (change) {
		publish('courses', [change], opts);
		void warmAvatars(
			[...change.value.teachers, ...(change.value.people ?? [])].map((p) => p.photoUrl)
		);
	}
	if (found.topics) {
		const topics = shapeContent(courseId, { topics: found.topics }).topics;
		publish('topics', applyContent('topics', courseId, topics, false), opts);
	}
	if (users.length) {
		const tried = getMeta<Record<string, number>>(`lookupTried:${courseId}`) ?? {};
		const now = Date.now();
		for (const id of users) tried[id] = now;
		setMeta(`lookupTried:${courseId}`, tried);
	}
	const errors = Object.fromEntries(
		Object.entries(found.errors ?? {}).filter(([part]) => !part.startsWith('user:'))
	);
	return scriptErrors(`${name} lookup`, errors);
}

export function updateCoursePrefs(courseId: string, patch: CoursePrefs) {
	if (patch.hidden !== undefined) {
		const result = hideCourse(courseId, patch);
		if (!result) return getCourse(courseId);
		publish('courses', [result.change]);
		for (const { table, rows } of result.deletes)
			publish(
				table,
				rows.map((r) => ({ type: 'delete' as const, key: r.id, value: r }))
			);
		rebuildSearchIndex();
		if (!patch.hidden) {
			// Unhiding leaves the course empty until content arrives; fetch
			// it now (silently — this is old work, not new arrivals).
			void syncSingleCourse(courseId, { silent: true }).catch((err) =>
				console.error('unhide sync failed', err)
			);
		}
		return result.change.value;
	}
	const change = setCoursePrefs(courseId, patch);
	if (change) {
		publish('courses', [change]);
		rebuildSearchIndex();
	}
	return change?.value ?? getCourse(courseId);
}

/**
 * One-time migration for databases that synced hidden courses with full
 * content before lazy-archived landed. Deletes that stale content once.
 */
function cullPreLazyContent() {
	if (getMeta<number>('archivedLazyCleanupV1')) return;
	const doomed = listAll('courses').filter(isArchived);
	const found = new Map<ContentTable, { id: string }[]>();
	for (const c of doomed)
		for (const table of CONTENT_TABLE_LIST) {
			const rows = listByCourse(table, c.id);
			if (rows.length) found.set(table, [...(found.get(table) ?? []), ...rows]);
		}
	for (const c of doomed) clearCourseContent(c.id);
	for (const [table, rows] of found)
		publish(
			table,
			rows.map((r) => ({ type: 'delete' as const, key: r.id, value: r }))
		);
	setMeta('archivedLazyCleanupV1', 1);
}

/** Fetch content for one archived/hidden course on demand. Bypasses the lazy filter. */
export async function syncSingleCourse(courseId: string, opts?: { silent?: boolean }) {
	const course = getCourse(courseId);
	if (!course) throw new Error('Course not found');
	const source = recordSource();
	const content = await source.courseContent(courseId, 0, true);
	const unknown = applyCourseContent(courseId, content, opts);
	if (unknown.users.length || unknown.topics)
		await resolveUnknown(courseId, course.name, unknown.users, opts);
	rebuildSearchIndex();
	return getCourse(courseId);
}

export type SubmissionAction = 'turnIn' | 'reclaim';

export async function submissionAction(
	action: SubmissionAction,
	courseId: string,
	workId: string,
	submissionId: string
) {
	// The Classroom session is the only path Google allows for hand-in on
	// teacher-created work, so it goes first; REST remains for the rest.
	if (action === 'turnIn') {
		const work = listByCourse('courseWork', courseId).find((w) => w.id === workId);
		const blocker = work && handInBlocker(work);
		if (blocker) throw new Error(blocker);
	}
	const web = enrichers().find((p) => p.enrich.submissionAction);
	if (web) {
		const { turnedIn } = await web.enrich.submissionAction!(action, courseId, workId);
		const existing = listByCourse('submissions', courseId).find((s) => s.id === submissionId);
		if (!existing) throw new Error('Submission record not found; sync first.');
		const row = {
			...existing,
			state: turnedIn ? 'TURNED_IN' : 'RECLAIMED_BY_STUDENT',
			updatedAt: Date.now()
		};
		publish('submissions', applyContent('submissions', courseId, [row], true));
		return row;
	}
	const result = await recordSource().submissionAction(action, courseId, workId, submissionId);
	const [row] = shapeContent(courseId, { submissions: [result.submission] }).submissions;
	publish('submissions', applyContent('submissions', courseId, [row], true));
	return row;
}

export function dismiss(id: string, dismissed: boolean) {
	publish('dismissals', [setDismissed(id, dismissed)]);
}

const shared = globalThis as typeof globalThis & {
	__classroomScheduler?: ReturnType<typeof setInterval>[];
};

const TICK_MS = 30_000;
const KEEP_ALIVE_MINUTES = 5;

function syncDueUsers() {
	for (const id of listUserIds())
		runAs(id, () => {
			const u = users();
			if (u.running || Date.now() < u.nextRunAt) return;
			if (!isConfigured()) {
				u.nextRunAt = Date.now() + Math.max(1, config.syncIntervalMinutes) * 60_000;
				return;
			}
			void runSync();
		});
}

function keepSessionsAlive() {
	for (const id of listUserIds())
		runAs(id, () => {
			if (users().richRunning) return;
			for (const provider of enrichers())
				void provider.enrich
					.keepAlive()
					.catch((err) => console.error('session keep-alive failed', err));
		});
}

/** One clock for every account: each user syncs on their own interval and backoff. */
export function startScheduler() {
	for (const timer of shared.__classroomScheduler ?? []) clearInterval(timer);
	syncDueUsers();
	shared.__classroomScheduler = [
		setInterval(syncDueUsers, TICK_MS),
		setInterval(keepSessionsAlive, KEEP_ALIVE_MINUTES * 60_000)
	];
}
