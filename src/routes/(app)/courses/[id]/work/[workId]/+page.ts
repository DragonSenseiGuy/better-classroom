import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { displayName } from '#lib/course.ts';

export const load: PageLoad = async ({ params, parent }) => {
	const { snapshot } = await parent();
	const course = snapshot.courses.find((c) => c.id === params.id);
	const work = snapshot.courseWork.find((w) => w.id === params.workId && w.courseId === params.id);
	if (!course || !work) error(404, 'Assignment not found');
	return {
		title: work.title,
		crumbs: [
			{ label: 'Courses' },
			{ label: displayName(course), href: `/courses/${course.id}` },
			{ label: work.title }
		]
	};
};
