import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { updateCoursePrefs } from '#lib/server/sync.ts';
import type { CoursePrefs } from '#lib/server/store.ts';
import { COLOR_NAMES } from '#lib/shared/colors.ts';

export const POST: RequestHandler = async ({ params, request }) => {
	const body = (await request.json()) as CoursePrefs;
	const patch: CoursePrefs = {};
	if ('nickname' in body) {
		if (body.nickname !== null && typeof body.nickname !== 'string')
			error(400, 'nickname must be a string');
		patch.nickname = body.nickname === null ? null : body.nickname.slice(0, 80);
	}
	if ('color' in body) {
		if (body.color !== null && !COLOR_NAMES.includes(body.color as never))
			error(400, 'color must be a palette name');
		patch.color = body.color;
	}
	if ('hidden' in body) {
		if (typeof body.hidden !== 'boolean') error(400, 'hidden must be a boolean');
		patch.hidden = body.hidden;
	}
	const course = updateCoursePrefs(params.id, patch);
	if (!course) error(404, 'Course not found');
	return json(course);
};
