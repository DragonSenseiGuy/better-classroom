import { eq, type InitialQueryBuilder } from '@tanstack/svelte-db';
import { courses, courseWork, submissions } from './collections';

export const workWithContext = (q: InitialQueryBuilder) =>
	q
		.from({ w: courseWork })
		.innerJoin({ c: courses }, ({ w, c }) => eq(w.courseId, c.id))
		.where(({ c }) => eq(c.hidden, false))
		.leftJoin({ s: submissions }, ({ w, s }) => eq(w.id, s.courseWorkId));
