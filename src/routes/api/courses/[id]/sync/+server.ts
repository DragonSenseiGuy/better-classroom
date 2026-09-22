import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCourse } from '#lib/server/store.ts';
import { syncSingleCourse } from '#lib/server/sync.ts';
import { errorMessage } from '#lib/server/http.ts';

export const POST: RequestHandler = async ({ params }) => {
	const existing = getCourse(params.id);
	if (!existing) error(404, 'Course not found');
	try {
		// Silent: backfilled work is old, not new arrivals — never push-notify for it.
		const course = await syncSingleCourse(params.id, { silent: true });
		return json({ course });
	} catch (err) {
		error(424, errorMessage(err));
	}
};
