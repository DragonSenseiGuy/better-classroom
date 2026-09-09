import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, parent }) => {
	const { snapshot } = await parent();
	const course = snapshot.courses.find((c) => c.id === params.id);
	const material = snapshot.materials.find((m) => m.id === params.mid && m.courseId === params.id);
	if (!course || !material) error(404, 'Material not found');
	return {
		title: material.title,
		crumbs: [
			{ label: 'Courses' },
			{ label: course.nickname || course.name, href: `/courses/${course.id}` },
			{ label: material.title }
		]
	};
};
