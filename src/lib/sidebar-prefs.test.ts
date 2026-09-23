import { test, expect } from 'bun:test';
import { ARCHIVED_OPEN_KEY, loadArchivedOpen, saveArchivedOpen } from './sidebar-prefs.ts';

function memoryStorage(initial: Record<string, string> = {}) {
	const store = new Map(Object.entries(initial));
	return {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => void store.set(key, value)
	};
}

test('archived section defaults to closed when nothing is stored', () => {
	expect(loadArchivedOpen(memoryStorage())).toBe(false);
	expect(loadArchivedOpen(null)).toBe(false);
	expect(loadArchivedOpen(undefined)).toBe(false);
});

test('archived section opens only on an explicit "1"', () => {
	expect(loadArchivedOpen(memoryStorage({ [ARCHIVED_OPEN_KEY]: '1' }))).toBe(true);
	for (const value of ['0', 'true', 'yes', '']) {
		expect(loadArchivedOpen(memoryStorage({ [ARCHIVED_OPEN_KEY]: value }))).toBe(false);
	}
});

test('save round-trips through load', () => {
	const storage = memoryStorage();
	saveArchivedOpen(storage, true);
	expect(loadArchivedOpen(storage)).toBe(true);
	saveArchivedOpen(storage, false);
	expect(loadArchivedOpen(storage)).toBe(false);
});

test('unavailable storage never throws and keeps the closed default', () => {
	const failing = {
		getItem: () => {
			throw new Error('denied');
		},
		setItem: () => {
			throw new Error('denied');
		}
	};
	expect(loadArchivedOpen(failing)).toBe(false);
	expect(() => saveArchivedOpen(failing, true)).not.toThrow();
});
