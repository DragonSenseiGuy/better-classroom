import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readJson, requireEnricher, upstream, workIds } from '#lib/server/http.ts';

const MAX_BYTES = 100 * 1024 * 1024;

const attachments = () => requireEnricher('attachments', 'Attachments');

export const GET: RequestHandler = async ({ url }) => {
	const { courseId, workId } = workIds(url);
	return json({ files: await upstream(() => attachments().list(courseId, workId)) });
};

export const POST: RequestHandler = async ({ request, url }) => {
	const { courseId, workId } = workIds(url);
	const form = await request.formData().catch(() => null);
	const file = form?.get('file');
	if (!(file instanceof File) || file.size === 0) error(400, 'file is required');
	if (file.size > MAX_BYTES) error(413, 'File is larger than 100 MB');
	const bytes = new Uint8Array(await file.arrayBuffer());
	const files = await upstream(() =>
		attachments().upload(courseId, workId, {
			name: file.name,
			type: file.type || 'application/octet-stream',
			bytes
		})
	);
	return json({ files });
};

export const DELETE: RequestHandler = async ({ request }) => {
	const body = await readJson<{ courseId: string; workId: string; driveId: string }>(request);
	const { courseId, workId, driveId } = body;
	if (typeof courseId !== 'string' || typeof workId !== 'string' || typeof driveId !== 'string')
		error(400, 'courseId, workId and driveId are required');
	return json({ files: await upstream(() => attachments().remove(courseId, workId, driveId)) });
};
