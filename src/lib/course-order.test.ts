import { test, expect } from 'bun:test';
import { applyPendingOrder, moveBefore, moveByDelta } from './course-order.ts';

test('moveBefore relocates before the target', () => {
	expect(moveBefore(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
	expect(moveBefore(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'a', 'c']);
});

test('moveBefore is noop for same or unknown ids', () => {
	const ids = ['a', 'b'];
	expect(moveBefore(ids, 'a', 'a')).toBe(ids);
	expect(moveBefore(ids, 'x', 'a')).toBe(ids);
	expect(moveBefore(ids, 'a', 'x')).toBe(ids);
});

test('moveByDelta clamps at the ends', () => {
	expect(moveByDelta(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
	expect(moveByDelta(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
	expect(moveByDelta(['a', 'b'], 'a', -5)).toEqual(['a', 'b']);
	expect(moveByDelta(['a', 'b'], 'b', 5)).toEqual(['a', 'b']);
	const ids = ['a', 'b'];
	expect(moveByDelta(ids, 'x', 1)).toBe(ids);
	expect(moveByDelta(ids, 'a', 0)).toBe(ids);
});

test('applyPendingOrder keeps unlisted rows after in stable order', () => {
	const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
	expect(applyPendingOrder(rows, ['c', 'a']).map((r) => r.id)).toEqual(['c', 'a', 'b']);
	expect(applyPendingOrder(rows, ['x', 'a']).map((r) => r.id)).toEqual(['a', 'b', 'c']);
});
