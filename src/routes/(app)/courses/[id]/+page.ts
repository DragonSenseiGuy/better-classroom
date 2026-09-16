import type { PageLoad } from './$types';
import { displayName } from '#lib/course.ts';

export const load: PageLoad = async ({ params, parent }) => {
	const { snapshot } = await parent();
	const course = snapshot.courses.find((c) => c.id === params.id);
	const label = course ? displayName(course) : 'Course';
	return { title: label, crumbs: [{ label: 'Courses' }, { label }] };
};
