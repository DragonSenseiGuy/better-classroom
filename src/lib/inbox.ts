import { eq, type InitialQueryBuilder } from '@tanstack/svelte-db';
import { announcements, courses, dismissals, materials } from '#lib/db/collections.ts';

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
