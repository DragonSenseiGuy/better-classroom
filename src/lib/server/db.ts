import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from './config';
import { perUser } from './tenant';

const PRAGMAS =
	'PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;';

// Vite re-evaluates server modules on reload; a second connection to the
// same file would race the first for the write lock, so connections live on
// globalThis and survive the module instance that opened them.
const shared = globalThis as typeof globalThis & {
	__classroomAuthDb?: Database;
	__classroomUserDbs?: ReturnType<typeof perUser<Database>>;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS courses (id TEXT PRIMARY KEY, data TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS courseWork (id TEXT PRIMARY KEY, courseId TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS materials (id TEXT PRIMARY KEY, courseId TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS announcements (id TEXT PRIMARY KEY, courseId TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS topics (id TEXT PRIMARY KEY, courseId TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS submissions (id TEXT PRIMARY KEY, courseId TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dismissals (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS courseWork_course ON courseWork(courseId);
CREATE INDEX IF NOT EXISTS materials_course ON materials(courseId);
CREATE INDEX IF NOT EXISTS announcements_course ON announcements(courseId);
CREATE INDEX IF NOT EXISTS topics_course ON topics(courseId);
CREATE INDEX IF NOT EXISTS submissions_course ON submissions(courseId);
`;

function open(path: string) {
	mkdirSync(dirname(path), { recursive: true });
	const database = new Database(path, { create: true });
	database.exec(PRAGMAS);
	return database;
}

/** The shared database at DATABASE_PATH; Better Auth owns its tables here. */
export function authDb() {
	return (shared.__classroomAuthDb ??= open(config.databasePath));
}

const userDbPath = (userId: string) =>
	join(dirname(config.databasePath), 'users', `${userId}.sqlite`);

const userDb = (shared.__classroomUserDbs ??= perUser((userId) => {
	const database = open(userDbPath(userId));
	database.exec(SCHEMA);
	return database;
}));

/** The signed-in user's Classroom cache. Requires a tenant context (see tenant.ts). */
export const db = () => userDb();

export function listUserIds(): string[] {
	const database = authDb();
	const exists = database
		.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'user'")
		.get();
	if (!exists) return [];
	return (database.query('SELECT id FROM "user"').all() as { id: string }[]).map((r) => r.id);
}
