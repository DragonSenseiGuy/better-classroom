import { eq, type InitialQueryBuilder } from '@tanstack/svelte-db';
import {
	announcements,
	courseWork,
	courses,
	dismissals,
	materials,
	submissions
} from '#lib/db/collections.ts';

export const inboxAnnouncements = (q: InitialQueryBuilder) =>
	q
		.from({ a: announcements })
		.innerJoin({ c: courses }, ({ a, c }) => eq(a.courseId, c.id))
		.where(({ c }) => eq(c.hidden, false));

export const inboxWork = (q: InitialQueryBuilder) =>
	q
		.from({ w: courseWork })
		.innerJoin({ c: courses }, ({ w, c }) => eq(w.courseId, c.id))
		.where(({ c }) => eq(c.hidden, false))
		.leftJoin({ s: submissions }, ({ w, s }) => eq(w.id, s.courseWorkId));

export const inboxMaterials = (q: InitialQueryBuilder) =>
	q
		.from({ m: materials })
		.innerJoin({ c: courses }, ({ m, c }) => eq(m.courseId, c.id))
		.where(({ c }) => eq(c.hidden, false));

export const allDismissals = (q: InitialQueryBuilder) => q.from({ d: dismissals });

export const inboxKey = (kind: 'announcement' | 'work' | 'material', id: string) => `${kind}:${id}`;
