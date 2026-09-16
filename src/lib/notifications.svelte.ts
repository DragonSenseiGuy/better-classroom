import { browser } from '$app/env';
import { goto } from '$app/navigation';
import favicon from '#lib/assets/favicon.png';
import { onChanges } from '#lib/db/live.svelte.ts';
import { notifyPayloads, type CourseLookup } from '#lib/shared/notify.ts';
import type { PushPayload } from '#lib/shared/types.ts';

const STORAGE = 'classroom:notifications';

export type NotifyMode = 'push' | 'in-page';

const currentPermission = () =>
	browser && 'Notification' in window ? Notification.permission : ('unsupported' as const);

const canNotify = () => browser && 'Notification' in window;

const canPush = () => canNotify() && 'serviceWorker' in navigator && 'PushManager' in window;

export const notifications = $state({
	enabled: false,
	ready: false,
	mode: 'push' as NotifyMode,
	permission: currentPermission() as NotificationPermission | 'unsupported'
});

export const notificationsSupported = () =>
	canNotify() && notifications.permission !== 'unsupported';

/** Set only in the in-page fallback, where no push subscription exists to read the state from. */
function storedFallback() {
	if (!browser) return false;
	try {
		return localStorage.getItem(STORAGE) === 'in-page';
	} catch {
		return false;
	}
}

function rememberFallback(on: boolean) {
	try {
		if (on) localStorage.setItem(STORAGE, 'in-page');
		else localStorage.removeItem(STORAGE);
	} catch {}
}

async function registration() {
	return (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.ready);
}

async function currentSubscription() {
	if (!canPush()) return null;
	return (await registration()).pushManager.getSubscription();
}

/** The server is the only thing that knows whether a push actually has anywhere to go. */
async function serverKey(): Promise<string | null> {
	const res = await fetch('/api/push');
	if (!res.ok) return null;
	const body = (await res.json()) as { configured: boolean; key: string | null };
	return body.configured ? body.key : null;
}

function urlBase64ToUint8Array(base64: string) {
	const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
		.replace(/-/g, '+')
		.replace(/_/g, '/');
	return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function syncPermission(permission: NotificationPermission) {
	notifications.permission = permission;
	if (permission !== 'granted') {
		notifications.enabled = false;
		rememberFallback(false);
	}
}

export async function initNotifications() {
	if (!canNotify()) {
		notifications.ready = true;
		return;
	}
	notifications.permission = currentPermission() as NotificationPermission;
	const granted = notifications.permission === 'granted';
	const subscription = canPush() ? await currentSubscription() : null;
	if (subscription) {
		notifications.mode = 'push';
		notifications.enabled = granted;
	} else if (storedFallback()) {
		notifications.mode = 'in-page';
		notifications.enabled = granted;
	} else {
		notifications.enabled = false;
	}
	notifications.ready = true;

	if (navigator.permissions?.query)
		void navigator.permissions
			.query({ name: 'notifications' as PermissionName })
			.then((status) => {
				const apply = () =>
					syncPermission(
						status.state === 'prompt' ? 'default' : (status.state as NotificationPermission)
					);
				apply();
				status.onchange = apply;
			})
			.catch(() => {});
}

export type EnableReason = 'denied' | 'unconfigured' | 'unsupported' | 'failed';

export type EnableResult =
	{ ok: true; mode: NotifyMode } | { ok: false; reason: EnableReason; detail?: string };

/**
 * Browsers with Google's services stripped out (ungoogled-chromium forks such as
 * Helium) still expose PushManager, then fail here because there is no push
 * service to register with. They can still show notifications from an open tab.
 */
const noPushService = (err: unknown) =>
	err instanceof DOMException && err.name === 'AbortError' && /push service/i.test(err.message);

async function turnOff() {
	const subscription = await currentSubscription();
	if (subscription) {
		await fetch('/api/push', {
			method: 'DELETE',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ endpoint: subscription.endpoint })
		}).catch(() => {});
		await subscription.unsubscribe().catch(() => {});
	}
	rememberFallback(false);
	notifications.enabled = false;
}

async function subscribeToPush(key: string): Promise<EnableResult> {
	const reg = await registration();
	const subscription =
		(await reg.pushManager.getSubscription()) ??
		(await reg.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: urlBase64ToUint8Array(key)
		}));
	const res = await fetch('/api/push', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(subscription.toJSON())
	});
	if (!res.ok) return { ok: false, reason: 'failed', detail: await res.text() };
	rememberFallback(false);
	notifications.mode = 'push';
	notifications.enabled = true;
	return { ok: true, mode: 'push' };
}

function fallbackToInPage(): EnableResult {
	rememberFallback(true);
	notifications.mode = 'in-page';
	notifications.enabled = true;
	return { ok: true, mode: 'in-page' };
}

export async function setNotificationsEnabled(enabled: boolean): Promise<EnableResult> {
	if (!canNotify()) return { ok: false, reason: 'unsupported' };

	if (!enabled) {
		await turnOff();
		return { ok: true, mode: notifications.mode };
	}

	if (currentPermission() !== 'granted') {
		notifications.permission = await Notification.requestPermission();
		if (notifications.permission !== 'granted') return { ok: false, reason: 'denied' };
	}

	const key = canPush() ? await serverKey() : null;
	if (!key) return canPush() ? { ok: false, reason: 'unconfigured' } : fallbackToInPage();

	try {
		return await subscribeToPush(key);
	} catch (err) {
		console.error('push subscription failed', err);
		if (noPushService(err)) return fallbackToInPage();
		return { ok: false, reason: 'failed', detail: (err as Error)?.message };
	}
}

export async function sendTestNotification() {
	if (notifications.mode === 'in-page') {
		show({
			title: 'Classroom',
			body: 'Notifications are working.',
			href: '/settings?tab=notifications',
			tag: 'test'
		});
		return true;
	}
	const res = await fetch('/api/push', { method: 'PUT' });
	return res.ok;
}

function show(payload: PushPayload) {
	try {
		const n = new Notification(payload.title, {
			body: payload.body,
			tag: payload.tag,
			icon: favicon
		});
		n.onclick = () => {
			window.focus();
			void goto(payload.href);
			n.close();
		};
	} catch {}
}

const watching = () =>
	notifications.enabled &&
	notifications.mode === 'in-page' &&
	notifications.permission === 'granted';

/**
 * Only runs where push is unavailable. Everywhere else the service worker shows
 * these same notifications, with the tab closed or open.
 */
export function watchForNewItems(course: CourseLookup) {
	if (!browser) return () => {};
	return onChanges((name, changes) => {
		if (!watching()) return;
		for (const payload of notifyPayloads(name, changes, course)) show(payload);
	});
}
