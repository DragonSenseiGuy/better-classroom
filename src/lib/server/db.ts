import type { Database as BunSqliteDatabase } from 'bun:sqlite';
import type { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from './config';
import { perUser } from './tenant';

const PRAGMAS =
	'PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS courses (id TEXT PRIMARY KEY, data TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS courseWork (id TEXT PRIMARY KEY, courseId TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS materials (id TEXT PRIMARY KEY, courseId TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS announcements (id TEXT PRIMARY KEY, courseId TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS topics (id TEXT PRIMARY KEY, courseId TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS submissions (id TEXT PRIMARY KEY, courseId TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dismissals (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS pushSubscriptions (endpoint TEXT PRIMARY KEY, data TEXT NOT NULL, createdAt INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS courseWork_course ON courseWork(courseId);
CREATE INDEX IF NOT EXISTS materials_course ON materials(courseId);
CREATE INDEX IF NOT EXISTS announcements_course ON announcements(courseId);
CREATE INDEX IF NOT EXISTS topics_course ON topics(courseId);
CREATE INDEX IF NOT EXISTS submissions_course ON submissions(courseId);
`;

// Vercel functions run on Node, where `bun:sqlite` does not exist — and a
// static `import 'bun:sqlite'` would crash the server at module load even
// when never used. Both drivers are therefore loaded lazily, each only on
// its own runtime. (Specifiers are concatenated so bundlers leave them
// alone; neither branch ever executes off-runtime.)
const isBun = typeof process !== 'undefined' && !!process.versions?.bun;
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BunDatabase: any = isBun ? require('bun' + ':sqlite').Database : null;
const NodeDatabaseSync: typeof DatabaseSync | null = isBun
	? null
	: (require('node' + ':sqlite') as typeof import('node:sqlite')).DatabaseSync;

type BunDb = {
	exec: (sql: string) => void;
	query: (sql: string) => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		get: (...params: any[]) => any;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		all: (...params: any[]) => any[];
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		run: (...params: any[]) => unknown;
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	transaction: <T extends (...args: any[]) => any>(fn: T) => T;
};

/** The bun:sqlite-shaped surface the rest of the server code programs against. */
export type AppDatabase = BunDb;

/** Raw driver handle, passed straight to Better Auth (it speaks both dialects). */
type RawDb = BunSqliteDatabase | DatabaseSync;

// Vite re-evaluates server modules on reload; a second connection to the
// same file would race the first for the write lock, so connections live on
// globalThis and survive the module instance that opened them.
const shared = globalThis as typeof globalThis & {
	__classroomAuthDbs?: Map<string, RawDb>;
	__classroomUserDbs?: ReturnType<typeof perUser<AppDatabase>>;
};

function openBun(path: string): BunSqliteDatabase {
	mkdirSync(dirname(path), { recursive: true });
	const database = new BunDatabase(path, { create: true }) as BunSqliteDatabase;
	database.exec(PRAGMAS);
	return database;
}

function openNode(path: string): DatabaseSync {
	mkdirSync(dirname(path), { recursive: true });
	const database = new NodeDatabaseSync!(path);
	database.exec(PRAGMAS);
	return database;
}

function openRaw(path: string): RawDb {
	return isBun ? openBun(path) : openNode(path);
}

/** Wraps node:sqlite's DatabaseSync in the bun:sqlite shape used by store.ts. */
function wrapNode(database: DatabaseSync): AppDatabase {
	return {
		exec: (sql) => {
			database.exec(sql);
		},
		query: (sql) => {
			const statement = database.prepare(sql);
			return {
				get: (...params) => statement.get(...params) ?? null,
				all: (...params) => statement.all(...params),
				run: (...params) => statement.run(...params)
			};
		},
		transaction:
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			<T extends (...args: any[]) => any>(fn: T): T =>
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				((...args: any[]) => {
					database.exec('BEGIN');
					try {
						const result = fn(...args);
						database.exec('COMMIT');
						return result;
					} catch (error) {
						database.exec('ROLLBACK');
						throw error;
					}
				}) as T
	};
}

function toApp(database: RawDb): AppDatabase {
	return isBun ? (database as AppDatabase) : wrapNode(database as DatabaseSync);
}

const authDbs = (shared.__classroomAuthDbs ??= new Map<string, RawDb>());

function rawAuthDb(): RawDb {
	// Keyed by path: configure() runs in ServerInit, after module imports
	// have already created the auth instance against the default path. A
	// single cached handle would pin Better Auth to that stale file while
	// migrations and per-user caches use the configured DATABASE_PATH.
	const path = config.databasePath;
	let database = authDbs.get(path);
	if (!database) {
		database = openRaw(path);
		authDbs.set(path, database);
	}
	return database;
}

/** The shared database at DATABASE_PATH; Better Auth owns its tables here. */
export function authDb(): RawDb {
	return rawAuthDb();
}

const userDbPath = (userId: string) =>
	join(dirname(config.databasePath), 'users', `${userId}.sqlite`);

const userDb = (shared.__classroomUserDbs ??= perUser((userId) => {
	const database = toApp(openRaw(userDbPath(userId)));
	database.exec(SCHEMA);
	return database;
}));

/** The signed-in user's Classroom cache. Requires a tenant context (see tenant.ts). */
export const db = (): AppDatabase => userDb();

export function listUserIds(): string[] {
	const database = toApp(rawAuthDb());
	const exists = database
		.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'user'")
		.get();
	if (!exists) return [];
	return (database.query('SELECT id FROM "user"').all() as { id: string }[]).map((r) => r.id);
}
