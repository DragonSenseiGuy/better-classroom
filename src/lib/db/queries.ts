import { eq, type InitialQueryBuilder } from '@tanstack/svelte-db';
import {
	announcements,
	courses,
	courseWork,
	dismissals,
	materials,
	submissions,
	topics
} from './collections';

export const workWithContext = (q: InitialQueryBuilder) =>
	q
		.from({ w: courseWork })
		.innerJoin({ c: courses }, ({ w, c }) => eq(w.courseId, c.id))
		.where(({ c }) => eq(c.hidden, false))
		.leftJoin({ s: submissions }, ({ w, s }) => eq(w.id, s.courseWorkId));

export const workInCourse = (q: InitialQueryBuilder, courseId: string | undefined) =>
	q
		.from({ w: courseWork })
		.where(({ w }) => eq(w.courseId, courseId))
		.leftJoin({ s: submissions }, ({ w, s }) => eq(w.id, s.courseWorkId));

export const inboxAnnouncements = (q: InitialQueryBuilder) =>
	q
		.from({ a: announcements })
		.innerJoin({ c: courses }, ({ a, c }) => eq(a.courseId, c.id))
		.where(({ c }) => eq(c.hidden, false));

export const inboxMaterials = (q: InitialQueryBuilder) =>
	q
		.from({ m: materials })
		.innerJoin({ c: courses }, ({ m, c }) => eq(m.courseId, c.id))
		.where(({ c }) => eq(c.hidden, false));

export const allDismissals = (q: InitialQueryBuilder) => q.from({ d: dismissals });

export const inboxKey = (kind: 'announcement' | 'material', id: string) => `${kind}:${id}`;

export const topicById = (q: InitialQueryBuilder, id: string | undefined) =>
	q
		.from({ t: topics })
		.where(({ t }) => eq(t.id, id ?? ''))
		.findOne();
