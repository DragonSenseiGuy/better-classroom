import { test, expect } from 'bun:test';
import {
	CookieError,
	parsePastedCookie,
	probeErrorMessage,
	sanitizeProbeAttempts,
	withoutCookie
} from './web-probe.ts';

test('accepts a full cookie header and strips a Cookie: prefix', () => {
	expect(parsePastedCookie('SID=a; SAPISID=b')).toBe('SID=a; SAPISID=b');
	expect(parsePastedCookie('Cookie: SID=a; SAPISID=b')).toBe('SID=a; SAPISID=b');
});

test('rejects pasted values without SID', () => {
	expect(() => parsePastedCookie('SSID=a; SAPISID=b')).toThrow(CookieError);
	expect(() => parsePastedCookie(undefined)).toThrow(CookieError);
	expect(() => parsePastedCookie('')).toThrow(CookieError);
});

test('maps CookieError to a cookie-coded probe error', () => {
	expect(probeErrorMessage(new CookieError('Paste it all'))).toEqual({
		ok: false,
		code: 'cookie',
		message: 'Paste it all'
	});
});

test('maps unknown failures to a probe-coded error', () => {
	expect(probeErrorMessage(new Error('boom'))).toEqual({
		ok: false,
		code: 'probe',
		message: 'boom'
	});
});

test('withoutCookie strips the cookie and keeps the rest', () => {
	expect(withoutCookie({ ok: true, authuser: 1, cookie: 'SID=secret' })).toEqual({
		ok: true,
		authuser: 1
	});
});

test('sanitizeProbeAttempts strips raw captures but keeps counts', () => {
	expect(
		sanitizeProbeAttempts([
			{
				authuser: 0,
				email: 'a@x.com',
				courses: [{ id: '1', name: 'Bio', items: 3, raw: { status: 200, head: 'h' } }]
			}
		])
	).toEqual([{ authuser: 0, email: 'a@x.com', courses: [{ id: '1', name: 'Bio', items: 3 }] }]);
});
