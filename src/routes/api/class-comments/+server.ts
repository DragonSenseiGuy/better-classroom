import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { enrichers, type CommentThreads } from '#lib/server/providers.ts';
import { readJson, upstream, workIds } from '#lib/server/http.ts';

// No connected source exposes class-wide coursework comments yet: the
// Classroom REST API has no comments endpoints and no web RPC for them has
// been captured. Report 501 (not 503) so the UI can tell "not implemented"
// apart from "session missing" and link out to Classroom instead.
const classComments = (): CommentThreads => {
	const found = enrichers().find((p) => p.enrich.classComments)?.enrich.classComments;
	if (!found)
		error(
			501,
			'Class comments cannot be synced yet — neither the Classroom API nor the saved session exposes them.'
		);
	return found;
};

export const GET: RequestHandler = async ({ url }) => {
	const { courseId, workId } = workIds(url);
	return json({ comments: await upstream(() => classComments().list(courseId, workId)) });
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await readJson<{ courseId: string; workId: string; text: string }>(request);
	const { courseId, workId } = body;
	if (typeof courseId !== 'string' || typeof workId !== 'string')
		error(400, 'courseId and workId are required');
	const text = typeof body.text === 'string' ? body.text.trim() : '';
	if (!text) error(400, 'text is required');
	return json({ comment: await upstream(() => classComments().post(courseId, workId, text)) });
};

export const DELETE: RequestHandler = async ({ request }) => {
	const body = await readJson<{ courseId: string; workId: string; commentId: string }>(request);
	const { courseId, workId, commentId } = body;
	if (typeof courseId !== 'string' || typeof workId !== 'string' || typeof commentId !== 'string')
		error(400, 'courseId, workId and commentId are required');
	await upstream(() => classComments().remove(courseId, workId, commentId));
	return json({ ok: true });
};
