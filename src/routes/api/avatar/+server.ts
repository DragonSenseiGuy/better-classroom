import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAvatar, isAllowedAvatarUrl } from '#lib/server/avatars.ts';

const MAX_AGE = 60 * 60 * 24 * 30;

export const GET: RequestHandler = async ({ url, request }) => {
	const target = url.searchParams.get('u');
	if (!target || !isAllowedAvatarUrl(target)) error(400, 'Unsupported avatar URL');
	const avatar = await getAvatar(target);
	if (!avatar) error(404, 'Avatar unavailable');
	if (request.headers.get('if-none-match') === avatar.etag) {
		return new Response(null, {
			status: 304,
			headers: { etag: avatar.etag, 'cache-control': `public, max-age=${MAX_AGE}, immutable` }
		});
	}
	return new Response(new Blob([avatar.bytes as BlobPart]), {
		headers: {
			'content-type': avatar.type,
			'content-length': String(avatar.bytes.byteLength),
			'cache-control': `public, max-age=${MAX_AGE}, immutable`,
			etag: avatar.etag
		}
	});
};
