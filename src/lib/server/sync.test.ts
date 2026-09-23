import { test, expect } from 'bun:test';
import { shapeContent } from './sync';

const iso = (n: number) => new Date(n).toISOString();

test('shapeContent falls back to creationTime when updateTime is missing', () => {
	const shaped = shapeContent('c1', {
		courseWork: [
			{
				id: 'w1',
				title: 'Work',
				materials: [],
				state: 'PUBLISHED',
				creationTime: iso(1784283111869)
			}
		],
		materials: [
			{
				id: 'm1',
				title: 'Material',
				materials: [],
				creationTime: iso(1784283111869)
			}
		],
		announcements: [
			{
				id: 'a1',
				text: 'Hello',
				materials: [],
				creationTime: iso(1789395973678)
			}
		],
		submissions: [
			{
				id: 's1',
				courseWorkId: 'w1',
				state: 'TURNED_IN',
				late: false,
				creationTime: iso(1789395973678),
				updateTime: undefined,
				attachments: []
			}
		]
	});
	expect(shaped.announcements[0]?.updatedAt).toBe(1789395973678);
	expect(shaped.courseWork[0]?.updatedAt).toBe(1784283111869);
	expect(shaped.materials[0]?.updatedAt).toBe(1784283111869);
	expect(shaped.submissions[0]?.updatedAt).toBe(1789395973678);
});

test('shapeContent keeps an explicit updateTime when present', () => {
	const shaped = shapeContent('c1', {
		announcements: [
			{
				id: 'a1',
				text: 'Hello',
				materials: [],
				creationTime: iso(1789395973678),
				updateTime: iso(1789500000000)
			}
		]
	});
	expect(shaped.announcements[0]).toMatchObject({
		createdAt: 1789395973678,
		updatedAt: 1789500000000
	});
});
