import { errorMessage, setCourseOrder } from '#lib/api.ts';
import { applyPendingOrder, moveBefore, moveByDelta } from '#lib/course-order.ts';
import type { CourseRef } from '#lib/course.ts';
import { notify } from '#lib/toast.ts';

export type OrderSection = 'visible' | 'archived';

/**
 * Owns sidebar drag-reorder state for both course sections: optimistic
 * pending order per section, shared drag/over tracking, atomic persist with
 * rollback, and server-echo reconciliation. The sidebar stays declarative.
 */
export function createCourseOrder(getVisible: () => CourseRef[], getArchived: () => CourseRef[]) {
	const rowsFor = (section: OrderSection) => (section === 'visible' ? getVisible() : getArchived());

	let pendingVisible = $state<string[] | null>(null);
	let pendingArchived = $state<string[] | null>(null);
	let dragId = $state<string | null>(null);
	let dragSection = $state<OrderSection | null>(null);
	let overId = $state<string | null>(null);

	const pendingFor = (section: OrderSection) =>
		section === 'visible' ? pendingVisible : pendingArchived;
	const setPending = (section: OrderSection, ids: string[] | null) => {
		if (section === 'visible') pendingVisible = ids;
		else pendingArchived = ids;
	};

	// Drop the override once the server echo reflects it.
	$effect(() => {
		const server = getVisible()
			.map((c) => c.id)
			.join('\0');
		if (pendingVisible && pendingVisible.join('\0') === server) pendingVisible = null;
	});
	$effect(() => {
		const server = getArchived()
			.map((c) => c.id)
			.join('\0');
		if (pendingArchived && pendingArchived.join('\0') === server) pendingArchived = null;
	});

	async function persist(section: OrderSection, next: string[]) {
		const previous = pendingFor(section);
		setPending(section, next);
		try {
			await setCourseOrder(next);
		} catch (err) {
			setPending(section, previous);
			notify('rose', 'Couldn’t save course order', { description: errorMessage(err) });
		}
	}

	const ids = (section: OrderSection) => pendingFor(section) ?? rowsFor(section).map((c) => c.id);

	return {
		get dragId() {
			return dragId;
		},
		get dragSection() {
			return dragSection;
		},
		get overId() {
			return overId;
		},
		ordered: (section: OrderSection) => {
			const pending = pendingFor(section);
			return pending ? applyPendingOrder(rowsFor(section), pending) : rowsFor(section);
		},
		move: (section: OrderSection, id: string, delta: number) => {
			const current = ids(section);
			const next = moveByDelta(current, id, delta);
			if (next !== current) void persist(section, next);
		},
		dragStart: (section: OrderSection, id: string, event: DragEvent) => {
			dragId = id;
			dragSection = section;
			overId = null;
			if (event.dataTransfer) {
				event.dataTransfer.effectAllowed = 'move';
				event.dataTransfer.setData('text/plain', id);
			}
		},
		dragOver: (section: OrderSection, id: string, event: DragEvent) => {
			if (!dragId || dragSection !== section || dragId === id) return;
			event.preventDefault();
			event.dataTransfer!.dropEffect = 'move';
			overId = id;
		},
		drop: (section: OrderSection, id: string, event: DragEvent) => {
			if (!dragId || dragSection !== section) return;
			event.preventDefault();
			const current = ids(section);
			const next = moveBefore(current, dragId, id);
			dragId = null;
			dragSection = null;
			overId = null;
			if (next !== current) void persist(section, next);
		},
		dropAtEnd: (section: OrderSection, event: DragEvent) => {
			if (!dragId || dragSection !== section) return;
			event.preventDefault();
			const current = ids(section);
			const dragged = dragId;
			dragId = null;
			dragSection = null;
			overId = null;
			if (current.at(-1) === dragged) return;
			void persist(section, [...current.filter((id) => id !== dragged), dragged]);
		},
		dragEnd: () => {
			dragId = null;
			dragSection = null;
			overId = null;
		}
	};
}
