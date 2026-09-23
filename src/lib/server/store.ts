import { db } from './db';
import type {
	Author,
	Change,
	CollectionName,
	Course,
	Dismissal,
	KeepAlive,
	Profile,
	RichStatus,
	RowOf,
	Snapshot,
	SyncStatus,
	Teacher
} from '#lib/shared/types.ts';
import { config, isConfigured } from './config';
import { open, seal } from './secrets';

type Row = { id: string; data: string };

const CONTENT_TABLES = [
	'courseWork',
	'materials',
	'announcements',
	'topics',
	'submissions'
] as const;
export type ContentTable = (typeof CONTENT_TABLES)[number];
export const CONTENT_TABLE_LIST: ContentTable[] = [...CONTENT_TABLES];

const parse = <T>(rows: Row[]) => rows.map((r) => JSON.parse(r.data) as T);

export function listAll<K extends CollectionName>(table: K): RowOf[K][] {
	return parse<RowOf[K]>(db().query(`SELECT id, data FROM ${table}`).all() as Row[]);
}

export function listByCourse<K extends ContentTable>(table: K, courseId: string): RowOf[K][] {
	return parse<RowOf[K]>(
		db().query(`SELECT id, data FROM ${table} WHERE courseId = ?`).all(courseId) as Row[]
	);
}

export function getMeta<T>(key: string): T | undefined {
	const row = db().query('SELECT value FROM meta WHERE key = ?').get(key) as {
		value: string;
	} | null;
	return row ? (JSON.parse(row.value) as T) : undefined;
}

export function setMeta(key: string, value: unknown) {
	db()
		.query(
			'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
		)
		.run(key, JSON.stringify(value));
}

export function deleteMeta(key: string) {
	db().query('DELETE FROM meta WHERE key = ?').run(key);
}

export type Connection = { url: string; key: string };

export function getConnection(): Connection | null {
	const stored = getMeta<Connection>('connection');
	return stored ? { ...stored, key: open(stored.key) } : null;
}

export function saveConnection(connection: Connection) {
	setMeta('connection', { ...connection, key: seal(connection.key) });
}

export type WebSession = { cookie: string; authuser: number; savedAt: number };

export function getWebSession(): WebSession | null {
	const stored = getMeta<WebSession>('webSession');
	return stored ? { ...stored, cookie: open(stored.cookie) } : null;
}

export function saveWebSession(session: WebSession | null) {
	const previous = getMeta<WebSession>('webSession');
	if (session) setMeta('webSession', { ...session, cookie: seal(session.cookie) });
	else deleteMeta('webSession');
	if (previous?.savedAt !== session?.savedAt) deleteMeta('webKeepAlive');
}

export function getWebSessionDraft(): string | undefined {
	const draft = getMeta<string>('webSessionDraft');
	return draft === undefined ? undefined : open(draft);
}

export const saveWebSessionDraft = (cookie: string) => setMeta('webSessionDraft', seal(cookie));

export const getKeepAlive = () => getMeta<KeepAlive>('webKeepAlive') ?? {};

export function saveKeepAlive(state: KeepAlive) {
	setMeta('webKeepAlive', state);
}

export const getRichStatus = () => getMeta<RichStatus>('richStatus') ?? null;

export function saveRichStatus(status: RichStatus) {
	setMeta('richStatus', status);
}

type RichTable = 'courseWork' | 'materials' | 'announcements';
const RICH_TABLES: RichTable[] = ['announcements', 'courseWork', 'materials'];

export function findPost(id: string): { table: RichTable; row: RowOf[RichTable] } | null {
	for (const table of RICH_TABLES) {
		const row = db().query(`SELECT id, data FROM ${table} WHERE id = ?`).get(id) as Row | null;
		if (row) return { table, row: JSON.parse(row.data) as RowOf[RichTable] };
	}
	return null;
}

export function setPostExtras<K extends RichTable>(
	table: K,
	row: RowOf[K],
	extras: { html?: string; author?: Author }
): Change<RowOf[K]> | null {
	const next = { ...row };
	if (extras.html !== undefined) next.html = extras.html;
	if (extras.author !== undefined) next.author = extras.author;
	if (stable(next) === stable(row)) return null;
	db().query(`UPDATE ${table} SET data = ? WHERE id = ?`).run(JSON.stringify(next), row.id);
	return { type: 'update', key: row.id, value: next };
}

export function setCourseStudents(courseId: string, students: Author[], studentCount: number) {
	return updateCourse(courseId, (prev) => ({ ...prev, students, studentCount }));
}

export type WebProfiles = Record<string, Author>;

export const getWebProfiles = () => getMeta<WebProfiles>('webProfiles') ?? {};

export function saveWebProfiles(profiles: WebProfiles) {
	setMeta('webProfiles', profiles);
}

export function getProfile() {
	return getMeta<Profile>('profile') ?? null;
}

const defaultSync = (): SyncStatus => ({
	status: 'idle',
	configured: isConfigured(),
	pending: 0,
	courseCount: 0,
	intervalMinutes: config.syncIntervalMinutes,
	version: 0
});

export function getSyncStatus(): SyncStatus {
	const stored = getMeta<Partial<SyncStatus>>('sync') ?? {};
	const syncedAt =
		stored.syncedAt ?? (stored.finishedAt && !stored.error ? stored.finishedAt : undefined);
	return {
		...defaultSync(),
		...stored,
		syncedAt,
		configured: isConfigured(),
		intervalMinutes: config.syncIntervalMinutes,
		status: stored.status === 'running' ? 'idle' : (stored.status ?? 'idle')
	};
}

export function saveSyncStatus(status: SyncStatus) {
	setMeta('sync', status);
}

export function snapshot(sync: SyncStatus): Snapshot {
	// Sends every cached row, including content the user fetched on demand
	// for archived courses. Laziness is enforced at write time (sync skips
	// archived/hidden content, hide/archive deletes it), so the snapshot
	// stays small for never-opened courses yet survives live resyncs for
	// opened ones. Consumers filter archived rows out of Home/To-do/Inbox.
	return {
		courses: listAll('courses').map((c) => ({ ...c, hidden: c.hidden ?? false })),
		courseWork: listAll('courseWork'),
		materials: listAll('materials'),
		announcements: listAll('announcements'),
		topics: listAll('topics'),
		submissions: listAll('submissions'),
		dismissals: listAll('dismissals'),
		profile: getProfile(),
		sync
	};
}

type MaybeRich = { html?: string; author?: Author; updatedAt?: number };

function keepHtml<T>(prev: T | undefined, fresh: T): T {
	const p = prev as MaybeRich | undefined;
	const f = fresh as MaybeRich;
	if (!p) return fresh;
	const out: MaybeRich = { ...f };
	if (p.author !== undefined && f.author === undefined) out.author = p.author;
	if (p.html !== undefined && f.html === undefined && p.updatedAt === f.updatedAt)
		out.html = p.html;
	return out as T;
}

function stable(value: unknown): string {
	return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (value && typeof value === 'object') {
		const obj = value as Record<string, unknown>;
		return Object.fromEntries(
			Object.keys(obj)
				.filter((k) => obj[k] !== undefined)
				.sort()
				.map((k) => [k, sortKeys(obj[k])])
		);
	}
	return value;
}

export function getCourse(courseId: string): Course | null {
	const row = db().query('SELECT id, data FROM courses WHERE id = ?').get(courseId) as Row | null;
	return row ? (JSON.parse(row.data) as Course) : null;
}

export function updateCourse(
	courseId: string,
	patch: (prev: Course) => Course
): Change<Course> | null {
	const prev = getCourse(courseId);
	if (!prev) return null;
	const next = patch(prev);
	if (stable(prev) === stable(next)) return null;
	db()
		.query('UPDATE courses SET data = ?, archived = ? WHERE id = ?')
		.run(JSON.stringify(next), next.archived ? 1 : 0, courseId);
	return { type: 'update', key: courseId, value: next };
}

export function clearCourseContent(courseId: string): void {
	const d = db();
	for (const table of CONTENT_TABLES)
		d.query(`DELETE FROM ${table} WHERE courseId = ?`).run(courseId);
}

export function applyCourses(
	courses: (Omit<
		Course,
		'archived' | 'lastSyncedAt' | 'nickname' | 'color' | 'hidden' | 'sortOrder' | 'teachers'
	> & {
		teachers?: Teacher[];
	})[]
): Change<Course>[] {
	const d = db();
	const existing = new Map(listAll('courses').map((c) => [c.id, c]));
	const changes: Change<Course>[] = [];
	const upsert = d.query(
		'INSERT INTO courses (id, data, archived) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, archived = excluded.archived'
	);
	const persist = (next: Course, prev: Course | undefined) => {
		if (!prev) changes.push({ type: 'insert', key: next.id, value: next });
		else if (stable(prev) !== stable(next))
			changes.push({ type: 'update', key: next.id, value: next });
		else return;
		upsert.run(next.id, JSON.stringify(next), next.archived ? 1 : 0);
		// Delete content only when transitioning into archived, so on-demand
		// fetches for already-archived courses survive background syncs.
		if (next.archived && !prev?.archived) clearCourseContent(next.id);
	};
	d.transaction(() => {
		const seen = new Set<string>();
		let nextOrder = 0;
		for (const c of existing.values())
			if (typeof c.sortOrder === 'number') nextOrder = Math.max(nextOrder, c.sortOrder + 1);
		for (const c of courses) {
			seen.add(c.id);
			const prev = existing.get(c.id);
			// Web-mode lists ARCHIVED rows explicitly; Apps Script is
			// ACTIVE-only so a missing row means archived (handled below).
			persist(
				{
					...c,
					teachers: c.teachers?.length ? c.teachers : (prev?.teachers ?? []),
					people: prev?.people ?? [],
					students: prev?.students,
					studentCount: prev?.studentCount,
					archived: c.courseState === 'ARCHIVED',
					lastSyncedAt: prev?.lastSyncedAt,
					nickname: prev?.nickname,
					color: prev?.color,
					hidden: prev?.hidden ?? false,
					sortOrder: prev?.sortOrder ?? nextOrder++
				},
				prev
			);
		}
		for (const prev of existing.values()) {
			if (seen.has(prev.id) || prev.archived) continue;
			persist({ ...prev, archived: true }, prev);
		}
	})();
	return changes;
}

export type CoursePrefs = { nickname?: string | null; color?: string | null; hidden?: boolean };

export function setCoursePrefs(courseId: string, patch: CoursePrefs) {
	return updateCourse(courseId, (prev) => ({
		...prev,
		nickname: patch.nickname === undefined ? prev.nickname : patch.nickname?.trim() || undefined,
		color: patch.color === undefined ? prev.color : (patch.color ?? undefined),
		hidden: patch.hidden ?? prev.hidden ?? false
	}));
}

/**
 * Persists a sidebar ordering atomically: the ids array is the desired
 * front-to-back order for one section (visible or archived). Unknown ids
 * are ignored; courses omitted from the list keep their existing sortOrder.
 * Callers pass the full section so relative order within the section is
 * exactly the array order.
 */
export function setCourseOrder(ids: string[]): Change<Course>[] {
	const d = db();
	return d.transaction(() => {
		const ordered = [...new Set(ids.filter((id) => typeof id === 'string' && id))];
		if (!ordered.length) return [];
		const changes: Change<Course>[] = [];
		ordered.forEach((id, index) => {
			const change = updateCourse(id, (prev) =>
				prev.sortOrder === index ? prev : { ...prev, sortOrder: index }
			);
			if (change) changes.push(change);
		});
		return changes;
	})();
}

/**
 * Applies a prefs patch and, when hiding, drops the course content —
 * atomically. Returns the course change plus per-table content deletes for
 * broadcast. Unhiding flips the flag only; the caller refetches on demand.
 */
export function hideCourse(courseId: string, patch: CoursePrefs) {
	const d = db();
	return d.transaction(() => {
		const prev = getCourse(courseId);
		if (!prev) return null;
		const doomed =
			patch.hidden === true
				? {
						courseWork: listByCourse('courseWork', courseId),
						materials: listByCourse('materials', courseId),
						announcements: listByCourse('announcements', courseId),
						topics: listByCourse('topics', courseId),
						submissions: listByCourse('submissions', courseId)
					}
				: null;
		const change = setCoursePrefs(courseId, patch);
		if (!change) return null;
		if (doomed) clearCourseContent(courseId);
		const deletes: { table: ContentTable; rows: { id: string }[] }[] = doomed
			? (Object.keys(doomed) as ContentTable[]).flatMap((table) => {
					const rows = doomed[table];
					return rows.length ? [{ table, rows }] : [];
				})
			: [];
		return { change, deletes };
	})();
}

export function mergeCoursePeople(
	courseId: string,
	patch: { teachers?: Teacher[]; people?: Teacher[] }
) {
	return updateCourse(courseId, (prev) => {
		const people = new Map((prev.people ?? []).map((p) => [p.userId, p]));
		for (const p of patch.people ?? []) people.set(p.userId, p);
		const teachers = patch.teachers?.length ? patch.teachers : prev.teachers;
		for (const t of teachers) people.delete(t.userId);
		return { ...prev, teachers, people: [...people.values()] };
	});
}

export function touchCourseSynced(courseId: string) {
	return updateCourse(courseId, (prev) => ({ ...prev, lastSyncedAt: Date.now() }));
}

export function applyContent<K extends ContentTable>(
	table: K,
	courseId: string,
	incoming: RowOf[K][],
	partial = false
): Change<RowOf[K]>[] {
	const d = db();
	const existing = new Map(listByCourse(table, courseId).map((r) => [r.id, r]));
	const changes: Change<RowOf[K]>[] = [];
	const upsert = d.query(
		`INSERT INTO ${table} (id, courseId, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET courseId = excluded.courseId, data = excluded.data`
	);
	const remove = d.query(`DELETE FROM ${table} WHERE id = ?`);
	d.transaction(() => {
		const seen = new Set<string>();
		for (const fresh of incoming) {
			seen.add(fresh.id);
			const prev = existing.get(fresh.id);
			const row = keepHtml(prev, fresh);
			if (!prev) changes.push({ type: 'insert', key: row.id, value: row });
			else if (stable(prev) !== stable(row))
				changes.push({ type: 'update', key: row.id, value: row });
			else continue;
			upsert.run(row.id, courseId, JSON.stringify(row));
		}
		if (partial) return;
		for (const prev of existing.values()) {
			if (seen.has(prev.id)) continue;
			remove.run(prev.id);
			changes.push({ type: 'delete', key: prev.id, value: prev });
		}
	})();
	return changes;
}

export function setDismissed(id: string, dismissed: boolean): Change<Dismissal> {
	if (dismissed) {
		const row: Dismissal = { id, at: Date.now() };
		db()
			.query(
				'INSERT INTO dismissals (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data'
			)
			.run(id, JSON.stringify(row));
		return { type: 'insert', key: id, value: row };
	}
	db().query('DELETE FROM dismissals WHERE id = ?').run(id);
	return { type: 'delete', key: id, value: { id, at: 0 } };
}

export function setProfile(profile: Profile) {
	setMeta('profile', profile);
}

export type StoredPushSubscription = {
	endpoint: string;
	keys: { p256dh: string; auth: string };
};

export function savePushSubscription(subscription: StoredPushSubscription) {
	db()
		.query(
			'INSERT INTO pushSubscriptions (endpoint, data, createdAt) VALUES (?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET data = excluded.data'
		)
		.run(subscription.endpoint, JSON.stringify(subscription), Date.now());
}

export function listPushSubscriptions(): StoredPushSubscription[] {
	return (db().query('SELECT data FROM pushSubscriptions').all() as { data: string }[]).map(
		(r) => JSON.parse(r.data) as StoredPushSubscription
	);
}

export function deletePushSubscription(endpoint: string) {
	db().query('DELETE FROM pushSubscriptions WHERE endpoint = ?').run(endpoint);
}
