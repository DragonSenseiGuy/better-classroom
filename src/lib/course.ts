import type { Course } from '#lib/shared/types.ts';

export type CourseRef = Pick<
	Course,
	'id' | 'name' | 'nickname' | 'color' | 'section' | 'alternateLink'
>;

type Named = { name: string; nickname?: string };

export const displayName = (course: Named) => course.nickname || course.name;

export const byDisplayName = (a: Named, b: Named) => displayName(a).localeCompare(displayName(b));

const placeholderLabels = new Set(['YEAR_GROUP', 'HOUSE_GROUP']);

export function courseLabel(value: string | undefined) {
	return value && !placeholderLabels.has(value.trim()) ? value : undefined;
}
