import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { enrichers } from '#lib/server/providers.ts';

function comments() {
	const provider = enrichers().find((p) => p.enrich.comments);
	if (!provider) error(503, 'Comments need a Classroom session. Add one in Settings.');
	return provider.enrich.comments!;
}

const ids = (url: URL) => {
	const courseId = url.searchParams.get('courseId');
	const workId = url.searchParams.get('workId');
	if (!courseId || !workId) error(400, 'courseId and workId are required');
	return { courseId, workId };
};

export const GET: RequestHandler = async ({ url }) => {
	const { courseId, workId } = ids(url);
	try {
		return json({ comments: await comments().list(courseId, workId) });
	} catch (err) {
		error(502, err instanceof Error ? err.message : String(err));
	}
};

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as {
		courseId?: unknown;
		workId?: unknown;
		text?: unknown;
	};
	if (typeof body.courseId !== 'string' || typeof body.workId !== 'string')
		error(400, 'courseId and workId are required');
	const text = typeof body.text === 'string' ? body.text.trim() : '';
	if (!text) error(400, 'text is required');
	try {
		return json({ comment: await comments().post(body.courseId, body.workId, text) });
	} catch (err) {
		error(502, err instanceof Error ? err.message : String(err));
	}
};

export const DELETE: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as {
		courseId?: unknown;
		workId?: unknown;
		commentId?: unknown;
	};
	if (
		typeof body.courseId !== 'string' ||
		typeof body.workId !== 'string' ||
		typeof body.commentId !== 'string'
	)
		error(400, 'courseId, workId and commentId are required');
	try {
		await comments().remove(body.courseId, body.workId, body.commentId);
		return json({ ok: true });
	} catch (err) {
		error(502, err instanceof Error ? err.message : String(err));
	}
};
