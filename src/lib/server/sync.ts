import {
	fetchAppsScript,
	type RawCourseContent,
	type RawLookup,
	type RawOverview,
	type RawSubmissionAction,
	type RawTeacher
} from './classroom';
import { warmAvatars } from './avatars';
import { fetchGoogle, isGoogleConnected } from './google';
import { config, isConfigured } from './config';
import { broadcast } from './events';
import { rebuildSearchIndex } from './search';
import {
	applyContent,
	applyCourses,
	getCourse,
	getMeta,
	getSyncStatus,
	listByCourse,
	mergeCoursePeople,
	saveSyncStatus,
	setMeta,
	setProfile,
	setCoursePrefs,
	setDismissed,
	touchCourseSynced,
	type ContentTable,
	type CoursePrefs
} from './store';
import { dueAt, ms } from '#lib/shared/time.ts';
import type { Attachment, Change, CollectionName, SyncStatus, Teacher } from '#lib/shared/types.ts';

let state: SyncStatus = getSyncStatus();
let running: Promise<void> | null = null;

export const syncStatus = () => state;

const fetchSource = <T>(params: Record<string, string>): Promise<T> =>
	isGoogleConnected() ? fetchGoogle<T>(params) : fetchAppsScript<T>(params);

function setState(patch: Partial<SyncStatus>) {
	state = {
		...state,
		...patch,
		configured: isConfigured(),
		intervalMinutes: config.syncIntervalMinutes
	};
	saveSyncStatus(state);
	broadcast({ type: 'sync', sync: state });
}

function publish(collection: CollectionName, changes: Change[]) {
	if (changes.length === 0) return;
	state = { ...state, version: state.version + 1 };
	broadcast({ type: 'changes', version: state.version, collection, changes });
}

let queuedFull = false;

export function runSync(options: { full?: boolean } = {}): Promise<void> {
	if (running) {
		if (options.full) queuedFull = true;
		return running;
	}
	running = doSync(options).finally(() => {
		running = null;
		if (queuedFull) {
			queuedFull = false;
			void runSync({ full: true });
		}
	});
	return running;
}

const QUOTA = /quota|rate ?limit|429/i;
let backoffMinutes = 0;

async function doSync(options: { full?: boolean }) {
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
		const overview = await fetchSource<RawOverview>(since ? { since: String(since) } : {});
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
		setState({ pending: courses.length, courseCount: courses.length });
		void warmAvatars([
			overview.profile.photoUrl ?? undefined,
			...courses.flatMap((c) => (c.teachers ?? []).map((t) => t.photoUrl))
		]);

		const errors: string[] = scriptErrors('Courses', overview.errors);
		const queue = [...courses];
		const worker = async () => {
			for (let c = queue.shift(); c; c = queue.shift()) {
				try {
					const params: Record<string, string> = { course: c.id };
					if (since) {
						params.since = String(since);
						if (listByCourse('courseWork', c.id).length === 0) params.work = '0';
					}
					const content = await fetchSource<RawCourseContent>(params);
					errors.push(...scriptErrors(c.name, content.errors));
					const unknown = applyCourseContent(c.id, content);
					if (unknown.users.length || unknown.topics)
						errors.push(...(await resolveUnknown(c.id, c.name, unknown.users)));
				} catch (err) {
					errors.push(`${c.name}: ${err instanceof Error ? err.message : String(err)}`);
				}
				setState({ pending: Math.max(0, state.pending - 1) });
			}
		};
		await Promise.all(
			Array.from({ length: Math.min(config.syncConcurrency, courses.length) }, worker)
		);
		rebuildSearchIndex();
		if (errors.length === 0) {
			setMeta('lastSyncStartedAt', startedAt);
			if (full) setMeta('lastFullSyncAt', startedAt);
		}
		backoffMinutes = errors.some((e) => QUOTA.test(e))
			? Math.min(30, (backoffMinutes || config.syncIntervalMinutes) * 2)
			: 0;
		setState({
			status: errors.length ? 'error' : 'idle',
			error: errors.length ? errors.join('\n') : undefined,
			finishedAt: Date.now(),
			pending: 0
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		backoffMinutes = QUOTA.test(message)
			? Math.min(30, (backoffMinutes || config.syncIntervalMinutes) * 2)
			: 0;
		setState({ status: 'error', error: message, finishedAt: Date.now(), pending: 0 });
	}
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

export function applyCourseContent(courseId: string, raw: RawCourseContent) {
	const content = shapeContent(courseId, raw);
	const partial = raw.partial === true;
	for (const table of Object.keys(content) as ContentTable[]) {
		if (raw[table] === undefined) continue;
		const keepMissing = partial && table !== 'submissions';
		publish(table, applyContent(table, courseId, content[table], keepMissing));
	}
	const touched = touchCourseSynced(courseId);
	if (touched) publish('courses', [touched]);
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

async function resolveUnknown(courseId: string, name: string, users: string[]) {
	const params: Record<string, string> = { course: courseId, lookup: '1' };
	if (users.length) params.users = users.join(',');
	const found = await fetchSource<RawLookup>(params);
	const change = mergeCoursePeople(courseId, {
		teachers: found.teachers?.map(person),
		people: found.people?.map(person)
	});
	if (change) {
		publish('courses', [change]);
		void warmAvatars(
			[...change.value.teachers, ...(change.value.people ?? [])].map((p) => p.photoUrl)
		);
	}
	if (found.topics) {
		const topics = shapeContent(courseId, { topics: found.topics }).topics;
		publish('topics', applyContent('topics', courseId, topics, false));
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
	const change = setCoursePrefs(courseId, patch);
	if (!change) return null;
	publish('courses', [change]);
	rebuildSearchIndex();
	return change.value;
}

export type SubmissionAction = 'turnIn' | 'reclaim';

export async function submissionAction(
	action: SubmissionAction,
	courseId: string,
	workId: string,
	submissionId: string
) {
	const result = await fetchSource<RawSubmissionAction>({
		action,
		course: courseId,
		work: workId,
		submission: submissionId
	});
	const [row] = shapeContent(courseId, { submissions: [result.submission] }).submissions;
	publish('submissions', applyContent('submissions', courseId, [row], true));
	return row;
}

export function dismiss(id: string, dismissed: boolean) {
	publish('dismissals', [setDismissed(id, dismissed)]);
}

let timer: ReturnType<typeof setTimeout> | undefined;

function scheduleNext() {
	const minutes = Math.max(backoffMinutes, Math.max(1, config.syncIntervalMinutes));
	timer = setTimeout(async () => {
		await runSync();
		scheduleNext();
	}, minutes * 60_000);
}

export function startScheduler() {
	if (timer) return;
	rebuildSearchIndex();
	if (isConfigured()) void runSync().then(scheduleNext);
	else scheduleNext();
}
