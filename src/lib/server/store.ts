import { db } from './db';
import type {
	Change,
	CollectionName,
	Course,
	Dismissal,
	Profile,
	RowOf,
	Snapshot,
	SyncStatus
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

export function applyCourses(
	courses: Omit<Course, 'archived' | 'lastSyncedAt' | 'nickname' | 'hidden'>[]
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
				archived: false,
				lastSyncedAt: prev?.lastSyncedAt,
				nickname: prev?.nickname,
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

export function setCoursePrefs(
	courseId: string,
	patch: { nickname?: string | null; hidden?: boolean }
): Change<Course> | null {
	const row = db().query('SELECT id, data FROM courses WHERE id = ?').get(courseId) as Row | null;
	if (!row) return null;
	const prev = JSON.parse(row.data) as Course;
	const next: Course = {
		...prev,
		nickname: patch.nickname === undefined ? prev.nickname : patch.nickname?.trim() || undefined,
		hidden: patch.hidden ?? prev.hidden ?? false
	};
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
		for (const row of incoming) {
			seen.add(row.id);
			const prev = existing.get(row.id);
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
