import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, parent }) => {
	const { snapshot } = await parent();
	const course = snapshot.courses.find((c) => c.id === params.id);
	const label = course ? course.nickname || course.name : 'Course';
	return { title: label, crumbs: [{ label: 'Courses' }, { label }] };
};
