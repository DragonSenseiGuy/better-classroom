import { test, expect } from 'bun:test';
import { readEnv } from './read-env';

const secret = 'x'.repeat(32);

test('applies defaults and coerces numbers', () => {
	const env = readEnv({ BETTER_AUTH_SECRET: secret, SYNC_INTERVAL_MINUTES: '10' });
	expect(env.SYNC_INTERVAL_MINUTES).toBe(10);
	expect(env.SYNC_CONCURRENCY).toBe(2);
	expect(env.FULL_SYNC_HOURS).toBe(6);
	expect(env.DATABASE_PATH).toBe('data/classroom.sqlite');
	expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
});

test('names the variable that failed validation', () => {
	expect(() => readEnv({ BETTER_AUTH_SECRET: 'short' })).toThrow(/^BETTER_AUTH_SECRET: /);
	expect(() => readEnv({ BETTER_AUTH_SECRET: secret, SYNC_CONCURRENCY: '0' })).toThrow(
		/^SYNC_CONCURRENCY: /
	);
});
