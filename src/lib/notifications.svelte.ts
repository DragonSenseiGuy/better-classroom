import { browser } from '$app/env';
import { goto } from '$app/navigation';
import favicon from '#lib/assets/favicon.png';
import { onChanges } from '#lib/db/live.svelte.ts';
import { formatDue } from '#lib/format.ts';
import { displayName } from '#lib/course.ts';
import type { Announcement, Change, CourseWork } from '#lib/shared/types.ts';

const STORAGE = 'classroom:notifications';

function stored() {
	if (!browser) return false;
	try {
		return localStorage.getItem(STORAGE) === '1';
	} catch {
		return false;
	}
}

const currentPermission = () =>
	browser && 'Notification' in window ? Notification.permission : ('unsupported' as const);

export const notifications = $state({
	enabled: stored() && currentPermission() === 'granted',
	permission: currentPermission() as NotificationPermission | 'unsupported'
});

export const notificationsSupported = () => notifications.permission !== 'unsupported';

function syncPermission(permission: NotificationPermission) {
	notifications.permission = permission;
	if (permission !== 'granted') notifications.enabled = false;
	else notifications.enabled = stored();
}

if (browser && notificationsSupported() && navigator.permissions?.query) {
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

export async function setNotificationsEnabled(enabled: boolean) {
	if (enabled && notifications.permission !== 'granted') {
		notifications.permission = await Notification.requestPermission();
		if (notifications.permission !== 'granted') enabled = false;
	}
	notifications.enabled = enabled;
	try {
		localStorage.setItem(STORAGE, enabled ? '1' : '0');
	} catch {}
}

export function sendTestNotification() {
	return new Promise<boolean>((resolve) => {
		if (notifications.permission !== 'granted') {
			notifications.permission = currentPermission() as NotificationPermission | 'unsupported';
			resolve(false);
			return;
		}
		try {
			const n = new Notification('Classroom', {
				body: 'Notifications are working.',
				tag: 'test',
				icon: favicon
			});
			n.onerror = () => resolve(false);
			n.onshow = () => resolve(true);
			setTimeout(() => resolve(true), 1500);
		} catch {
			resolve(false);
		}
	});
}

const active = () => notifications.enabled && notifications.permission === 'granted';

type CourseLookup = (id: string) => { name: string; nickname?: string } | undefined;

function show(title: string, body: string, href: string, tag: string) {
	try {
		const n = new Notification(title, { body, tag, icon: favicon });
		n.onclick = () => {
			window.focus();
			void goto(href);
			n.close();
		};
	} catch {}
}

export function watchForNewItems(course: CourseLookup) {
	if (!browser) return () => {};
	return onChanges((name, changes) => {
		if (!active()) return;
		const inserts = changes.filter((c) => c.type === 'insert');
		if (!inserts.length) return;
		if (name === 'courseWork') notifyWork(inserts as Change<CourseWork>[], course);
		else if (name === 'announcements')
			notifyAnnouncements(inserts as Change<Announcement>[], course);
	});
}

function notifyWork(changes: Change<CourseWork>[], course: CourseLookup) {
	const items = changes.map((c) => c.value);
	const c = course(items[0]!.courseId);
	const where = c ? displayName(c) : 'Classroom';
	if (items.length > 3) {
		show(`${items.length} new assignments`, where, '/todo', `work:${items[0]!.courseId}`);
		return;
	}
	for (const w of items)
		show(
			`New assignment · ${where}`,
			`${w.title}${w.dueAt ? ` · due ${formatDue(w.dueAt, w.hasDueTime)}` : ''}`,
			`/courses/${w.courseId}/work/${w.id}`,
			`work:${w.id}`
		);
}

function notifyAnnouncements(changes: Change<Announcement>[], course: CourseLookup) {
	const items = changes.map((c) => c.value);
	const c = course(items[0]!.courseId);
	const where = c ? displayName(c) : 'Classroom';
	if (items.length > 3) {
		show(`${items.length} new posts`, where, '/inbox', `post:${items[0]!.courseId}`);
		return;
	}
	for (const a of items)
		show(
			`New post · ${where}`,
			a.text.slice(0, 120),
			`/courses/${a.courseId}?tab=stream#a-${a.id}`,
			`post:${a.id}`
		);
}
