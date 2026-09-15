import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { enrichers } from '#lib/server/providers.ts';

const MAX_BYTES = 100 * 1024 * 1024;

function attachments() {
	const provider = enrichers().find((p) => p.enrich.attachments);
	if (!provider) error(503, 'Attachments need a Classroom session. Add one in Settings.');
	return provider.enrich.attachments!;
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
		return json({ files: await attachments().list(courseId, workId) });
	} catch (err) {
		error(502, err instanceof Error ? err.message : String(err));
	}
};

export const POST: RequestHandler = async ({ request, url }) => {
	const { courseId, workId } = ids(url);
	const form = await request.formData().catch(() => null);
	const file = form?.get('file');
	if (!(file instanceof File) || file.size === 0) error(400, 'file is required');
	if (file.size > MAX_BYTES) error(413, 'File is larger than 100 MB');
	try {
		const files = await attachments().upload(courseId, workId, {
			name: file.name,
			type: file.type || 'application/octet-stream',
			bytes: new Uint8Array(await file.arrayBuffer())
		});
		return json({ files });
	} catch (err) {
		error(502, err instanceof Error ? err.message : String(err));
	}
};

export const DELETE: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as {
		courseId?: unknown;
		workId?: unknown;
		driveId?: unknown;
	};
	if (
		typeof body.courseId !== 'string' ||
		typeof body.workId !== 'string' ||
		typeof body.driveId !== 'string'
	)
		error(400, 'courseId, workId and driveId are required');
	try {
		return json({ files: await attachments().remove(body.courseId, body.workId, body.driveId) });
	} catch (err) {
		error(502, err instanceof Error ? err.message : String(err));
	}
};
