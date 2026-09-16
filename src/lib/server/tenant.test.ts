import { test, expect } from 'bun:test';
import { currentUserId, perUser, runAs } from './tenant';

test('currentUserId follows the runAs scope', () => {
	expect(currentUserId()).toBeNull();
	runAs('outer', () => {
		expect(currentUserId()).toBe('outer');
		runAs('inner', () => expect(currentUserId()).toBe('inner'));
		expect(currentUserId()).toBe('outer');
	});
	expect(currentUserId()).toBeNull();
});

test('perUser keeps one slot per tenant', () => {
	let created = 0;
	const slot = perUser((userId) => ({ userId, n: ++created }));
	const a = runAs('a', () => slot());
	expect(runAs('a', () => slot())).toBe(a);
	expect(runAs('b', () => slot()).userId).toBe('b');
	expect(created).toBe(2);
	expect(slot.peek('a')).toBe(a);
	expect(slot.peek('c')).toBeUndefined();
	slot.forget('a');
	expect(runAs('a', () => slot())).not.toBe(a);
});

test('perUser refuses to resolve outside a tenant', () => {
	const slot = perUser(() => ({}));
	expect(() => slot()).toThrow('No signed-in user in this context.');
	expect(slot('explicit')).toEqual({});
});
