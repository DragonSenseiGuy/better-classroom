import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config';

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

let instance: Database | undefined;

export function db() {
	if (instance) return instance;
	mkdirSync(dirname(config.databasePath), { recursive: true });
	instance = new Database(config.databasePath, { create: true });
	instance.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
	instance.exec(SCHEMA);
	return instance;
}
