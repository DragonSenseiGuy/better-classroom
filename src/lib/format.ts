import type { WorkStatus } from '#lib/shared/status.ts';

const DAY = 86_400_000;

const SHORT: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };
const LONG: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };

const formatters = new Map<string, Intl.DateTimeFormat>();
function fmt(options: Intl.DateTimeFormatOptions) {
	const key = JSON.stringify(options);
	let f = formatters.get(key);
	if (!f) {
		f = new Intl.DateTimeFormat('en-GB', options);
		formatters.set(key, f);
	}
	return f;
}

/** True when `t` falls outside the current year, so the year is worth showing. */
export function outsideThisYear(t: number, utc = false, now = Date.now()) {
	const d = new Date(t);
	return (utc ? d.getUTCFullYear() : d.getFullYear()) !== new Date(now).getFullYear();
}

/** Formats a date, adding the year only when it is not the current one. */
export function formatDate(
	t: number,
	options: Intl.DateTimeFormatOptions = SHORT,
	utc = false,
	now = Date.now()
) {
	return fmt({
		...options,
		...(utc ? { timeZone: 'UTC' } : {}),
		...(outsideThisYear(t, utc, now) ? { year: 'numeric' } : {})
	}).format(t);
}

const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const fullFmt = new Intl.DateTimeFormat('en-GB', {
	day: 'numeric',
	month: 'short',
	year: 'numeric',
	hour: '2-digit',
	minute: '2-digit'
});

export function startOfDay(t: number) {
	const d = new Date(t);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

function utcDayStartLocal(t: number) {
	const d = new Date(t);
	return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).getTime();
}

export function dueDayStart(dueAt: number, hasDueTime: boolean) {
	return hasDueTime ? startOfDay(dueAt) : utcDayStartLocal(dueAt);
}

export function dayLabel(dayStart: number, now = Date.now()) {
	const today = startOfDay(now);
	const diff = Math.round((dayStart - today) / DAY);
	if (diff === 0) return 'Today';
	if (diff === 1) return 'Tomorrow';
	if (diff === -1) return 'Yesterday';
	if (diff > 1 && diff < 7)
		return new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(dayStart);
	return formatDate(dayStart, LONG, false, now);
}

export function formatDue(
	dueAt: number | undefined,
	hasDueTime: boolean,
	now = Date.now()
): string {
	if (dueAt === undefined) return 'No due date';
	const dayStart = dueDayStart(dueAt, hasDueTime);
	const label = dayLabel(dayStart, now);
	const date = label.length > 9 ? formatDate(dueAt, SHORT, !hasDueTime, now) : label;
	return hasDueTime ? `${date}, ${timeFmt.format(dueAt)}` : date;
}

export function formatDateLong(t: number, utc = false) {
	return formatDate(t, LONG, utc);
}

export function formatDateTime(t: number) {
	return fullFmt.format(t);
}

export function formatRelative(t: number, now = Date.now()) {
	const diff = now - t;
	if (diff < 60_000) return 'just now';
	if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
	if (diff < DAY) return `${Math.floor(diff / 3_600_000)}h ago`;
	if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;
	return formatDate(t, SHORT, false, now);
}

export function isDueSoon(dueAt: number | undefined, now = Date.now()) {
	return dueAt !== undefined && dueAt >= now && dueAt - now < 2 * DAY;
}

export const statusLabel: Record<WorkStatus, string> = {
	graded: 'Graded',
	returned: 'Returned',
	turnedIn: 'Turned in',
	missing: 'Missing',
	assigned: 'Assigned'
};

export function statusRank(status: WorkStatus) {
	return { missing: 0, assigned: 1, returned: 2, turnedIn: 3, graded: 4 }[status];
}

export { courseColor } from '#lib/course-colors.svelte.ts';

export function initials(name: string | undefined) {
	if (!name) return '?';
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((p) => p[0]!.toUpperCase())
		.join('');
}

export function pluralize(n: number, word: string) {
	return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function greeting(now = new Date()) {
	const h = now.getHours();
	if (h < 12) return 'Good morning';
	if (h < 18) return 'Good afternoon';
	return 'Good evening';
}

export function displayName(course: { name: string; nickname?: string }) {
	return course.nickname || course.name;
}

const placeholderLabels = new Set(['YEAR_GROUP', 'HOUSE_GROUP']);

export function courseLabel(value: string | undefined) {
	return value && !placeholderLabels.has(value.trim()) ? value : undefined;
}

export function avatarUrl(url: string | undefined) {
	return url ? `/api/avatar?u=${encodeURIComponent(url)}` : undefined;
}
