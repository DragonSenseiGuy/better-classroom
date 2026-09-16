import { formatDue } from '#lib/format.ts';
import { displayName } from '#lib/course.ts';
import type { Announcement, Change, CollectionName, CourseWork, PushPayload } from './types.ts';

export type CourseLookup = (id: string) => { name: string; nickname?: string } | undefined;

/**
 * What a notification says, independent of how it is delivered. The server uses
 * this to build push payloads; browsers without a push service use it to build
 * in-page notifications from the same change feed.
 */
export function notifyPayloads(
	collection: CollectionName,
	changes: Change[],
	course: CourseLookup
): PushPayload[] {
	const inserts = changes.filter((c) => c.type === 'insert');
	if (inserts.length === 0) return [];
	if (collection === 'courseWork') return workPayloads(inserts as Change<CourseWork>[], course);
	if (collection === 'announcements')
		return announcementPayloads(inserts as Change<Announcement>[], course);
	return [];
}

const whereFor = (course: CourseLookup, courseId: string) => {
	const c = course(courseId);
	return c ? displayName(c) : 'Classroom';
};

function workPayloads(changes: Change<CourseWork>[], course: CourseLookup): PushPayload[] {
	const items = changes.map((c) => c.value);
	const where = whereFor(course, items[0]!.courseId);
	if (items.length > 3)
		return [
			{
				title: `${items.length} new assignments`,
				body: where,
				href: '/todo',
				tag: `work:${items[0]!.courseId}`
			}
		];
	return items.map((w) => ({
		title: `New assignment · ${where}`,
		body: `${w.title}${w.dueAt ? ` · due ${formatDue(w.dueAt, w.hasDueTime)}` : ''}`,
		href: `/courses/${w.courseId}/work/${w.id}`,
		tag: `work:${w.id}`
	}));
}

function announcementPayloads(
	changes: Change<Announcement>[],
	course: CourseLookup
): PushPayload[] {
	const items = changes.map((c) => c.value);
	const where = whereFor(course, items[0]!.courseId);
	if (items.length > 3)
		return [
			{
				title: `${items.length} new posts`,
				body: where,
				href: '/inbox',
				tag: `post:${items[0]!.courseId}`
			}
		];
	return items.map((a) => ({
		title: `New post · ${where}`,
		body: a.text.slice(0, 120),
		href: `/courses/${a.courseId}?tab=stream#a-${a.id}`,
		tag: `post:${a.id}`
	}));
}
