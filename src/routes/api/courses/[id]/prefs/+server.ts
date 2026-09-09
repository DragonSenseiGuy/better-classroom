import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { updateCoursePrefs } from '#lib/server/sync.ts';

export const POST: RequestHandler = async ({ params, request }) => {
	const body = (await request.json()) as { nickname?: string | null; hidden?: boolean };
	const patch: { nickname?: string | null; hidden?: boolean } = {};
	if ('nickname' in body) {
		if (body.nickname !== null && typeof body.nickname !== 'string')
			error(400, 'nickname must be a string');
		patch.nickname = body.nickname === null ? null : body.nickname.slice(0, 80);
	}
	if ('hidden' in body) {
		if (typeof body.hidden !== 'boolean') error(400, 'hidden must be a boolean');
		patch.hidden = body.hidden;
	}
	const course = updateCoursePrefs(params.id, patch);
	if (!course) error(404, 'Course not found');
	return json(course);
};
