import { test, expect } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configure } from './config';
import { runAs } from './tenant';
import {
	applyContent,
	applyCourses,
	deleteMeta,
	getCourse,
	getMeta,
	hideCourse,
	listByCourse,
	setCourseOrder,
	setCoursePrefs,
	setMeta,
	snapshot,
	updateCourse
} from './store';
import type { Announcement } from '#lib/shared/types.ts';

configure({ databasePath: join(mkdtempSync(join(tmpdir(), 'classroom-')), 'classroom.sqlite') });

const as = <T>(fn: () => T) => runAs('store-test', fn);

const course = (id: string, name = id) => ({
	id,
	name,
	courseState: 'ACTIVE',
	createdAt: 1,
	updatedAt: 1
});

const post = (id: string, patch: Partial<Announcement> = {}): Announcement => ({
	id,
	courseId: 'c1',
	text: `post ${id}`,
	materials: [],
	createdAt: 1,
	updatedAt: 1,
	...patch
});

test('meta round-trips and deletes', () => {
	as(() => {
		setMeta('k', { a: 1 });
		expect(getMeta<{ a: number }>('k')).toEqual({ a: 1 });
		deleteMeta('k');
		expect(getMeta('k')).toBeUndefined();
	});
});

test('applyCourses inserts, updates and archives', () => {
	as(() => {
		expect(applyCourses([course('c1'), course('c2')]).map((c) => c.type)).toEqual([
			'insert',
			'insert'
		]);
		expect(applyCourses([course('c1'), course('c2')])).toEqual([]);
		const changes = applyCourses([course('c1', 'Renamed')]);
		expect(changes.map((c) => [c.type, c.key])).toEqual([
			['update', 'c1'],
			['update', 'c2']
		]);
		expect(getCourse('c1')?.name).toBe('Renamed');
		expect(getCourse('c2')?.archived).toBe(true);
	});
});

test('updateCourse only writes when the patch changes something', () => {
	as(() => {
		applyCourses([course('c1')]);
		expect(updateCourse('missing', (c) => c)).toBeNull();
		expect(updateCourse('c1', (c) => ({ ...c }))).toBeNull();
		const change = updateCourse('c1', (c) => ({ ...c, room: '12' }));
		expect(change).toMatchObject({ type: 'update', key: 'c1', value: { room: '12' } });
		expect(getCourse('c1')?.room).toBe('12');
		expect(setCoursePrefs('c1', { nickname: '  Maths ' })?.value.nickname).toBe('Maths');
		expect(setCoursePrefs('c1', { nickname: 'Maths' })).toBeNull();
	});
});

test('applyContent diffs rows and honours partial batches', () => {
	as(() => {
		applyCourses([course('c1')]);
		expect(applyContent('announcements', 'c1', [post('a'), post('b')]).length).toBe(2);
		expect(applyContent('announcements', 'c1', [post('a'), post('b')])).toEqual([]);
		const partial = applyContent('announcements', 'c1', [post('a', { text: 'edited' })], true);
		expect(partial.map((c) => [c.type, c.key])).toEqual([['update', 'a']]);
		expect(listByCourse('announcements', 'c1').length).toBe(2);
		const full = applyContent('announcements', 'c1', [post('a', { text: 'edited' })]);
		expect(full.map((c) => [c.type, c.key])).toEqual([['delete', 'b']]);
	});
});

test('applyContent keeps rich html only while the post is unchanged', () => {
	as(() => {
		applyCourses([course('c1')]);
		applyContent('announcements', 'c1', [post('r', { html: '<b>x</b>', updatedAt: 5 })]);
		applyContent('announcements', 'c1', [post('r', { updatedAt: 5 })]);
		expect(listByCourse('announcements', 'c1')[0]?.html).toBe('<b>x</b>');
		applyContent('announcements', 'c1', [post('r', { updatedAt: 6 })]);
		expect(listByCourse('announcements', 'c1')[0]?.html).toBeUndefined();
	});
});

test('explicit ARCHIVED keeps the name row and drops content', () => {
	runAs('store-test-archived', () => {
		const changes = applyCourses([{ ...course('arc1'), courseState: 'ARCHIVED' }]);
		expect(changes.map((c) => [c.type, c.key])).toEqual([['insert', 'arc1']]);
		expect(getCourse('arc1')?.archived).toBe(true);
		applyContent('announcements', 'arc1', [{ ...post('x'), courseId: 'arc1' }]);
		expect(listByCourse('announcements', 'arc1').length).toBe(1);
		// Re-listing as ARCHIVED (e.g. a rename) re-marks without a delete event…
		const again = applyCourses([{ ...course('arc1', 'Renamed'), courseState: 'ARCHIVED' }]);
		expect(again.map((c) => [c.type, c.key])).toEqual([['update', 'arc1']]);
		// …but a transition into archived wipes content.
		applyCourses([{ ...course('arc1', 'Renamed'), courseState: 'ACTIVE' }]);
		expect(getCourse('arc1')?.archived).toBe(false);
		expect(listByCourse('announcements', 'arc1').length).toBe(1);
		applyCourses([{ ...course('arc1', 'Renamed'), courseState: 'ARCHIVED' }]);
		expect(getCourse('arc1')?.archived).toBe(true);
		expect(listByCourse('announcements', 'arc1').length).toBe(0);
	});
});

test('on-demand content cached for archived courses survives background relists', () => {
	runAs('store-test-cache', () => {
		applyCourses([{ ...course('arc2'), courseState: 'ARCHIVED' }]);
		applyContent('announcements', 'arc2', [{ ...post('y'), courseId: 'arc2' }]);
		// Metadata-only relist must not wipe the fetched cache.
		applyCourses([{ ...course('arc2', 'Renamed again'), courseState: 'ARCHIVED' }]);
		expect(listByCourse('announcements', 'arc2').length).toBe(1);
	});
});

test('hideCourse atomically hides and clears content', () => {
	runAs('store-test-hide', () => {
		applyCourses([course('hid1')]);
		applyContent('announcements', 'hid1', [{ ...post('h'), courseId: 'hid1' }]);
		const result = hideCourse('hid1', { hidden: true });
		expect(result?.change.value.hidden).toBe(true);
		expect(result?.deletes.flatMap((d) => d.rows).length).toBe(1);
		expect(listByCourse('announcements', 'hid1').length).toBe(0);
		expect(getCourse('hid1')?.hidden).toBe(true);
		const back = hideCourse('hid1', { hidden: false });
		expect(back?.change.value.hidden).toBe(false);
		expect(back?.deletes).toEqual([]);
	});
});

test('snapshot keeps archived names with their on-demand content', () => {
	runAs('store-test-snapshot', () => {
		applyCourses([{ ...course('snap1'), courseState: 'ARCHIVED' }]);
		applyContent('announcements', 'snap1', [{ ...post('s'), courseId: 'snap1' }]);
		const snap = snapshot({
			status: 'idle',
			configured: false,
			pending: 0,
			courseCount: 0,
			intervalMinutes: 0,
			version: 0
		});
		expect(snap.courses.find((c) => c.id === 'snap1')?.archived).toBe(true);
		expect(snap.announcements.filter((a) => a.courseId === 'snap1').length).toBe(1);
	});
});

test('applyCourses preserves order and appends new courses at the end', () => {
	runAs('store-test-order', () => {
		applyCourses([course('o1'), course('o2')]);
		const before = [getCourse('o1')?.sortOrder, getCourse('o2')?.sortOrder];
		expect(before[0]).toBeLessThan(before[1]!);
		applyCourses([course('o1', 'Renamed'), course('o2'), course('o3')]);
		expect(getCourse('o1')?.sortOrder).toBe(before[0]);
		expect(getCourse('o2')?.sortOrder).toBe(before[1]);
		expect(getCourse('o3')?.sortOrder).toBeGreaterThan(before[1]!);
	});
});

test('setCourseOrder reorders atomically and ignores unknown ids', () => {
	runAs('store-test-reorder', () => {
		applyCourses([course('r1'), course('r2'), course('r3')]);
		const changes = setCourseOrder(['r3', 'r1', 'r2', 'missing']);
		expect(changes.map((c) => [c.key, c.value.sortOrder])).toEqual([
			['r3', 0],
			['r1', 1],
			['r2', 2]
		]);
		expect(setCourseOrder(['r3', 'r1', 'r2'])).toEqual([]);
		expect(setCourseOrder([])).toEqual([]);
	});
});
