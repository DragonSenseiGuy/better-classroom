import { test, expect } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configure } from './config';
import { authDb, listUserIds } from './db';

const dbA = join(mkdtempSync(join(tmpdir(), 'classroom-auth-a-')), 'classroom.sqlite');
const dbB = join(mkdtempSync(join(tmpdir(), 'classroom-auth-b-')), 'classroom.sqlite');

test('auth database follows configure() instead of sticking to the first path', () => {
	configure({ databasePath: dbA });
	authDb().exec('CREATE TABLE "user" (id TEXT PRIMARY KEY)');
	authDb().exec(`INSERT INTO "user" (id) VALUES ('user-a')`);
	expect(listUserIds()).toEqual(['user-a']);

	// Switching paths must switch files, not reuse the first handle.
	configure({ databasePath: dbB });
	expect(listUserIds()).toEqual([]);

	// And switching back must find the original rows again.
	configure({ databasePath: dbA });
	expect(listUserIds()).toEqual(['user-a']);
});
