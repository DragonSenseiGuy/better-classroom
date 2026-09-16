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
	listByCourse,
	setCoursePrefs,
	setMeta,
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
			['delete', 'c2']
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
