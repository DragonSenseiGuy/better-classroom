import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readJson, requireEnricher, upstream, workIds } from '#lib/server/http.ts';

const comments = () => requireEnricher('comments', 'Comments');

export const GET: RequestHandler = async ({ url }) => {
	const { courseId, workId } = workIds(url);
	return json({ comments: await upstream(() => comments().list(courseId, workId)) });
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await readJson<{ courseId: string; workId: string; text: string }>(request);
	const { courseId, workId } = body;
	if (typeof courseId !== 'string' || typeof workId !== 'string')
		error(400, 'courseId and workId are required');
	const text = typeof body.text === 'string' ? body.text.trim() : '';
	if (!text) error(400, 'text is required');
	return json({ comment: await upstream(() => comments().post(courseId, workId, text)) });
};

export const DELETE: RequestHandler = async ({ request }) => {
	const body = await readJson<{ courseId: string; workId: string; commentId: string }>(request);
	const { courseId, workId, commentId } = body;
	if (typeof courseId !== 'string' || typeof workId !== 'string' || typeof commentId !== 'string')
		error(400, 'courseId, workId and commentId are required');
	await upstream(() => comments().remove(courseId, workId, commentId));
	return json({ ok: true });
};
