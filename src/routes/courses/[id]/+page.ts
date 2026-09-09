import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, parent }) => {
	const { snapshot } = await parent();
	const course = snapshot.courses.find((c) => c.id === params.id);
	if (!course) error(404, 'Course not found');
	const label = course.nickname || course.name;
	return { title: label, crumbs: [{ label: 'Courses' }, { label }] };
};
