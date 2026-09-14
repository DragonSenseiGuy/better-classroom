import { browser } from '$app/env';
import { goto } from '$app/navigation';
import { onChanges } from '#lib/db/live.svelte.ts';
import { displayName, formatDue } from '#lib/format.ts';
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

export const notifications = $state({
	enabled: stored(),
	permission: (browser && 'Notification' in window ? Notification.permission : 'unsupported') as
		NotificationPermission | 'unsupported'
});

export const notificationsSupported = () => notifications.permission !== 'unsupported';

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

const active = () => notifications.enabled && notifications.permission === 'granted';

type CourseLookup = (id: string) => { name: string; nickname?: string } | undefined;

function show(title: string, body: string, href: string, tag: string) {
	const n = new Notification(title, { body, tag, icon: '/favicon.svg' });
	n.onclick = () => {
		window.focus();
		void goto(href);
		n.close();
	};
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
