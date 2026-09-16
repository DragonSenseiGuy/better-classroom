import { test, expect } from 'bun:test';
import { error, isHttpError } from '@sveltejs/kit';
import { errorMessage, readJson, upstream, workIds } from './http';

const status = (fn: () => unknown) => {
	try {
		fn();
	} catch (err) {
		return isHttpError(err) ? err.status : undefined;
	}
};

test('errorMessage unwraps errors and stringifies the rest', () => {
	expect(errorMessage(new Error('boom'))).toBe('boom');
	expect(errorMessage('plain')).toBe('plain');
	expect(errorMessage(undefined)).toBe('undefined');
});

test('readJson tolerates a malformed body', async () => {
	const bad = new Request('http://x', { method: 'POST', body: 'nope' });
	expect(await readJson(bad)).toEqual({});
	const good = new Request('http://x', { method: 'POST', body: JSON.stringify({ a: 1 }) });
	expect(await readJson<{ a: number }>(good)).toEqual({ a: 1 });
});

test('workIds requires both params', () => {
	expect(workIds(new URL('http://x/?courseId=c&workId=w'))).toEqual({
		courseId: 'c',
		workId: 'w'
	});
	expect(status(() => workIds(new URL('http://x/?courseId=c')))).toBe(400);
});

test('upstream keeps http errors and wraps the rest as 502', async () => {
	expect(await upstream(async () => 1)).toBe(1);
	await expect(
		upstream(async () => {
			error(404, 'gone');
		})
	).rejects.toMatchObject({ status: 404 });
	await expect(
		upstream(async () => {
			throw new Error('upstream down');
		})
	).rejects.toMatchObject({ status: 502, body: { message: 'upstream down' } });
});
