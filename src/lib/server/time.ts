export function ms(iso: string | undefined): number {
	if (!iso) return 0;
	const t = Date.parse(iso);
	return Number.isFinite(t) ? t : 0;
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
