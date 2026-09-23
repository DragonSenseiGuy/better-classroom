import { test, expect } from 'bun:test';
import { updatedAtMs } from './time';

const iso = (n: number) => new Date(n).toISOString();

test('updatedAtMs prefers updateTime over creationTime', () => {
	expect(updatedAtMs(iso(1789395973678), iso(1789500000000))).toBe(1789500000000);
});

test('updatedAtMs falls back to creationTime when updateTime is missing', () => {
	expect(updatedAtMs(iso(1789395973678), undefined)).toBe(1789395973678);
});

test('updatedAtMs is 0 only when both times are missing', () => {
	expect(updatedAtMs(undefined, undefined)).toBe(0);
});
