import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readJson } from '#lib/server/http.ts';
import { updateCourseOrder } from '#lib/server/sync.ts';

export const POST: RequestHandler = async ({ request }) => {
	const body = await readJson<{ ids?: unknown }>(request);
	if (!body || !Array.isArray(body.ids)) error(400, 'ids must be an array');
	if (body.ids.length > 500) error(400, 'ids must have at most 500 entries');
	for (const id of body.ids) if (typeof id !== 'string' || !id) error(400, 'ids must be strings');
	const courses = updateCourseOrder(body.ids as string[]);
	return json({ courses });
};
