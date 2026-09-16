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

export const formatTime = (t: number) => timeFmt.format(t);

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
