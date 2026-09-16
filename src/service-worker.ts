/// <reference lib="webworker" />
import favicon from '#lib/assets/favicon.png';
import type { PushPayload } from '#lib/shared/types.ts';

const sw = self as unknown as ServiceWorkerGlobalScope;

const FALLBACK: PushPayload = {
	title: 'Classroom',
	body: 'Something new arrived.',
	href: '/inbox',
	tag: 'classroom'
};

function payloadFrom(event: PushEvent): PushPayload {
	try {
		const data = event.data?.json() as Partial<PushPayload> | undefined;
		if (!data?.title) return FALLBACK;
		return {
			title: data.title,
			body: data.body ?? '',
			href: data.href ?? FALLBACK.href,
			tag: data.tag ?? FALLBACK.tag
		};
	} catch {
		return FALLBACK;
	}
}

sw.addEventListener('install', () => void sw.skipWaiting());

sw.addEventListener('activate', (event) => event.waitUntil(sw.clients.claim()));

sw.addEventListener('push', (event) => {
	const payload = payloadFrom(event);
	event.waitUntil(
		sw.registration.showNotification(payload.title, {
			body: payload.body,
			tag: payload.tag,
			icon: favicon,
			badge: favicon,
			data: { href: payload.href }
		})
	);
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const href = (event.notification.data as { href?: string } | null)?.href ?? '/';
	event.waitUntil(
		(async () => {
			const target = new URL(href, sw.location.origin);
			const clients = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
			const existing = clients.find((c) => new URL(c.url).origin === target.origin);
			if (existing) {
				await existing.focus();
				await existing.navigate(target.href).catch(() => {});
				return;
			}
			await sw.clients.openWindow(target.href);
		})()
	);
});
