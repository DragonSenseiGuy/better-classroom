export function ms(iso: string | undefined): number {
	if (!iso) return 0;
	const t = Date.parse(iso);
	return Number.isFinite(t) ? t : 0;
}

/**
 * updateTime is absent on unedited rows from every source (the web stream
 * exposes creation time only), so fall back to creationTime. Never emits 0
 * when creation is known: the stream, inbox and search all sort by
 * updatedAt, and 0-rows tie and surface stale posts on top.
 */
export function updatedAtMs(
	creationTime: string | undefined,
	updateTime: string | undefined
): number {
	return ms(updateTime) || ms(creationTime);
}

export function dueAt(
	date?: { year?: number; month?: number; day?: number },
	time?: { hours?: number; minutes?: number }
): { dueAt: number | undefined; hasDueTime: boolean } {
	if (!date || !date.year || !date.month || !date.day)
		return { dueAt: undefined, hasDueTime: false };
	if (time && time.hours !== undefined) {
		return {
			dueAt: Date.UTC(date.year, date.month - 1, date.day, time.hours, time.minutes ?? 0),
			hasDueTime: true
		};
	}
	return { dueAt: Date.UTC(date.year, date.month - 1, date.day, 23, 59), hasDueTime: false };
}
