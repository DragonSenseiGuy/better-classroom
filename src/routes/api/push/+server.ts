import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readJson } from '#lib/server/http.ts';
import { pushConfigured, pushPublicKey, sendPush } from '#lib/server/push.ts';
import {
	deletePushSubscription,
	listPushSubscriptions,
	savePushSubscription,
	type StoredPushSubscription
} from '#lib/server/store.ts';

export const GET: RequestHandler = async () =>
	json({ configured: pushConfigured(), key: pushPublicKey() });

function parse(body: unknown): StoredPushSubscription {
	const sub = body as Partial<StoredPushSubscription> | null;
	if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint))
		error(400, 'endpoint must be an https URL');
	if (typeof sub.keys?.p256dh !== 'string' || typeof sub.keys?.auth !== 'string')
		error(400, 'keys.p256dh and keys.auth are required');
	return { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
}

export const POST: RequestHandler = async ({ request }) => {
	if (!pushConfigured()) error(503, 'Push is not configured on this server.');
	savePushSubscription(parse(await readJson(request)));
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request }) => {
	const body = await readJson<{ endpoint?: string }>(request);
	if (typeof body.endpoint !== 'string') error(400, 'endpoint is required');
	deletePushSubscription(body.endpoint);
	return json({ ok: true });
};

export const PUT: RequestHandler = async () => {
	if (!pushConfigured()) error(503, 'Push is not configured on this server.');
	if (listPushSubscriptions().length === 0) error(409, 'This browser is not subscribed yet.');
	await sendPush([
		{
			title: 'Classroom',
			body: 'Notifications are working.',
			href: '/settings?tab=notifications',
			tag: 'test'
		}
	]);
	return json({ ok: true });
};
