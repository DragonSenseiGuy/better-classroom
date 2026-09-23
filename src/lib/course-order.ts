/** Pure helpers for sidebar course ordering (shared by sidebar + settings). */

/** Move `activeId` to just before `overId`. Returns the original array when noop. */
export function moveBefore(ids: string[], activeId: string, overId: string): string[] {
	if (activeId === overId) return ids;
	const from = ids.indexOf(activeId);
	const to = ids.indexOf(overId);
	if (from === -1 || to === -1) return ids;
	const next = ids.filter((id) => id !== activeId);
	const insertAt = next.indexOf(overId);
	next.splice(insertAt, 0, activeId);
	return next;
}

/** Move `id` by `delta` slots (-1 = up). Clamps at the ends, noop when missing. */
export function moveByDelta(ids: string[], id: string, delta: number): string[] {
	const from = ids.indexOf(id);
	if (from === -1 || delta === 0) return ids;
	const to = Math.min(ids.length - 1, Math.max(0, from + delta));
	if (to === from) return ids;
	const next = ids.filter((v) => v !== id);
	next.splice(to, 0, id);
	return next;
}

/** Order rows by a pending id list; rows missing from the list keep their order after. */
export function applyPendingOrder<T extends { id: string }>(rows: T[], ids: string[]): T[] {
	const byId = new Map(rows.map((r) => [r.id, r]));
	const out: T[] = [];
	for (const id of ids) {
		const row = byId.get(id);
		if (row) {
			out.push(row);
			byId.delete(id);
		}
	}
	for (const row of rows) if (byId.has(row.id)) out.push(row);
	return out;
}
