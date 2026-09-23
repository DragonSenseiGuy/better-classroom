import type { Course } from '#lib/shared/types.ts';

export type CourseRef = Pick<
	Course,
	| 'id'
	| 'name'
	| 'nickname'
	| 'color'
	| 'section'
	| 'alternateLink'
	| 'hidden'
	| 'archived'
	| 'sortOrder'
>;

type ArchivedLike = Pick<Course, 'hidden' | 'archived'>;

/** Hidden locally or archived in Classroom: kept as a name row, content loads on demand. */
export const isArchived = (course: ArchivedLike) => !!course.hidden || !!course.archived;

export const isVisible = (course: ArchivedLike) => !isArchived(course);

type Named = { name: string; nickname?: string };

export const displayName = (course: Named) => course.nickname || course.name;

export const byDisplayName = (a: Named, b: Named) => displayName(a).localeCompare(displayName(b));

type Ordered = Named & { sortOrder?: number };

const orderKey = (course: Ordered) => course.sortOrder ?? Number.MAX_SAFE_INTEGER;

/** Custom sidebar order first, alphabetical display name as the stable tiebreak. */
export const byCourseOrder = (a: Ordered, b: Ordered) =>
	orderKey(a) - orderKey(b) || byDisplayName(a, b);

const placeholderLabels = new Set(['YEAR_GROUP', 'HOUSE_GROUP']);

export function courseLabel(value: string | undefined) {
	return value && !placeholderLabels.has(value.trim()) ? value : undefined;
}
