import { db } from './db';
import type {
	Author,
	Change,
	CollectionName,
	Course,
	Dismissal,
	Profile,
	RichStatus,
	RowOf,
	Snapshot,
	SyncStatus,
	Teacher
} from '#lib/shared/types.ts';
import { config, isConfigured } from './config';

type Row = { id: string; data: string };

const CONTENT_TABLES = [
	'courseWork',
	'materials',
	'announcements',
	'topics',
	'submissions'
] as const;
export type ContentTable = (typeof CONTENT_TABLES)[number];

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

export type Connection = { url: string; key: string };

export const getConnection = () => getMeta<Connection>('connection') ?? null;

export function saveConnection(connection: Connection) {
	setMeta('connection', connection);
}

export type WebSession = { cookie: string; authuser: number; savedAt: number };

export const getWebSession = () => getMeta<WebSession>('webSession') ?? null;

export function saveWebSession(session: WebSession | null) {
	if (session) setMeta('webSession', session);
	else db().query('DELETE FROM meta WHERE key = ?').run('webSession');
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
	return {
		...defaultSync(),
		...stored,
		configured: isConfigured(),
		intervalMinutes: config.syncIntervalMinutes,
		status: stored.status === 'running' ? 'idle' : (stored.status ?? 'idle')
	};
}

export function saveSyncStatus(status: SyncStatus) {
	setMeta('sync', status);
}

export function snapshot(sync: SyncStatus): Snapshot {
	return {
		courses: listAll('courses')
			.filter((c) => !c.archived)
			.map((c) => ({ ...c, hidden: c.hidden ?? false })),
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

export function applyCourses(
	courses: (Omit<
		Course,
		'archived' | 'lastSyncedAt' | 'nickname' | 'color' | 'hidden' | 'teachers'
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
	d.transaction(() => {
		const seen = new Set<string>();
		for (const c of courses) {
			seen.add(c.id);
			const prev = existing.get(c.id);
			const next: Course = {
				...c,
				teachers: c.teachers?.length ? c.teachers : (prev?.teachers ?? []),
				people: prev?.people ?? [],
				archived: false,
				lastSyncedAt: prev?.lastSyncedAt,
				nickname: prev?.nickname,
				color: prev?.color,
				hidden: prev?.hidden ?? false
			};
			if (!prev) changes.push({ type: 'insert', key: c.id, value: next });
			else if (stable(prev) !== stable(next))
				changes.push({ type: 'update', key: c.id, value: next });
			else continue;
			upsert.run(c.id, JSON.stringify(next), 0);
		}
		for (const prev of existing.values()) {
			if (seen.has(prev.id) || prev.archived) continue;
			const next = { ...prev, archived: true };
			upsert.run(prev.id, JSON.stringify(next), 1);
			changes.push({ type: 'delete', key: prev.id, value: next });
			for (const table of CONTENT_TABLES)
				d.query(`DELETE FROM ${table} WHERE courseId = ?`).run(prev.id);
		}
	})();
	return changes;
}

export type CoursePrefs = { nickname?: string | null; color?: string | null; hidden?: boolean };

export function setCoursePrefs(courseId: string, patch: CoursePrefs): Change<Course> | null {
	const row = db().query('SELECT id, data FROM courses WHERE id = ?').get(courseId) as Row | null;
	if (!row) return null;
	const prev = JSON.parse(row.data) as Course;
	const next: Course = {
		...prev,
		nickname: patch.nickname === undefined ? prev.nickname : patch.nickname?.trim() || undefined,
		color: patch.color === undefined ? prev.color : (patch.color ?? undefined),
		hidden: patch.hidden ?? prev.hidden ?? false
	};
	db().query('UPDATE courses SET data = ? WHERE id = ?').run(JSON.stringify(next), courseId);
	return { type: 'update', key: courseId, value: next };
}

export function mergeCoursePeople(
	courseId: string,
	patch: { teachers?: Teacher[]; people?: Teacher[] }
): Change<Course> | null {
	const prev = getCourse(courseId);
	if (!prev) return null;
	const people = new Map((prev.people ?? []).map((p) => [p.userId, p]));
	for (const p of patch.people ?? []) people.set(p.userId, p);
	const teachers = patch.teachers?.length ? patch.teachers : prev.teachers;
	for (const t of teachers) people.delete(t.userId);
	const next: Course = { ...prev, teachers, people: [...people.values()] };
	if (stable(prev) === stable(next)) return null;
	db().query('UPDATE courses SET data = ? WHERE id = ?').run(JSON.stringify(next), courseId);
	return { type: 'update', key: courseId, value: next };
}

export function touchCourseSynced(courseId: string): Change<Course> | null {
	const row = db().query('SELECT id, data FROM courses WHERE id = ?').get(courseId) as Row | null;
	if (!row) return null;
	const next: Course = { ...(JSON.parse(row.data) as Course), lastSyncedAt: Date.now() };
	db().query('UPDATE courses SET data = ? WHERE id = ?').run(JSON.stringify(next), courseId);
	return { type: 'update', key: courseId, value: next };
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
