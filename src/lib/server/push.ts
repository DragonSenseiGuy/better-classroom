import webpush from 'web-push';
import { deletePushSubscription, listPushSubscriptions } from './store';
import { currentUserId, runAs } from './tenant';
import type { PushPayload } from '#lib/shared/types.ts';

type PushConfig = { publicKey: string; privateKey: string; subject: string };

let settings: PushConfig | null = null;

export function configurePush(config: Partial<PushConfig>) {
	if (!config.publicKey || !config.privateKey) {
		settings = null;
		return;
	}
	settings = {
		publicKey: config.publicKey,
		privateKey: config.privateKey,
		subject: config.subject || 'mailto:noreply@example.com'
	};
	webpush.setVapidDetails(settings.subject, settings.publicKey, settings.privateKey);
}

export const pushConfigured = () => settings !== null;

export const pushPublicKey = () => settings?.publicKey ?? null;

/** Gone means the browser dropped the subscription; anything else may recover, so keep it. */
const isGone = (err: unknown) => {
	const status = (err as { statusCode?: number } | null)?.statusCode;
	return status === 404 || status === 410;
};

export async function sendPush(payloads: PushPayload[]) {
	if (!settings || payloads.length === 0) return;
	const userId = currentUserId();
	if (!userId) return;
	const subscriptions = listPushSubscriptions();
	if (subscriptions.length === 0) return;

	await Promise.all(
		subscriptions.flatMap((subscription) =>
			payloads.map(async (payload) => {
				try {
					await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 86_400 });
				} catch (err) {
					if (isGone(err)) runAs(userId, () => deletePushSubscription(subscription.endpoint));
					else console.error('push failed', (err as Error)?.message ?? err);
				}
			})
		)
	);
}
