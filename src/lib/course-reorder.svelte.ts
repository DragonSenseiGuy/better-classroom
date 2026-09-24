import { errorMessage, setCourseOrder } from '#lib/api.ts';
import { applyPendingOrder, moveByDelta, moveToPosition } from '#lib/course-order.ts';
import type { DropPosition } from '#lib/course-order.ts';
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
	let dropPosition = $state<DropPosition | null>(null);

	function clearDrag() {
		dragId = null;
		dragSection = null;
		overId = null;
		dropPosition = null;
	}

	/** Top half of the row = insert before, bottom half = insert after. */
	function positionFromEvent(event: DragEvent): DropPosition {
		const el = event.currentTarget as HTMLElement | null;
		const rect = el?.getBoundingClientRect();
		if (!rect || rect.height === 0) return 'before';
		return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
	}

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
		get dropPosition() {
			return dropPosition;
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
			dropPosition = null;
			const dt = event.dataTransfer;
			if (dt) {
				dt.effectAllowed = 'move';
				dt.setData('text/plain', id);
				// Drag from the grip handle, so the ghost would be tiny —
				// use the whole row as the drag image instead.
				const handle = event.currentTarget as HTMLElement | null;
				const row = handle?.closest('li') ?? handle;
				if (row instanceof HTMLElement) {
					try {
						dt.setDragImage(row, 24, 24);
					} catch {
						// Non-critical: falls back to the default ghost.
					}
				}
			}
		},
		dragOver: (section: OrderSection, id: string, event: DragEvent) => {
			if (!dragId || dragSection !== section || dragId === id) return;
			event.preventDefault();
			if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
			overId = id;
			dropPosition = positionFromEvent(event);
		},
		dragLeave: (id: string, event: DragEvent) => {
			if (overId !== id) return;
			// dragleave bubbles from children — only clear when the pointer
			// actually left the row, not when moving between elements inside it.
			const el = event.currentTarget;
			const related = event.relatedTarget;
			if (el instanceof HTMLElement && related instanceof Node && el.contains(related)) return;
			overId = null;
			dropPosition = null;
		},
		drop: (section: OrderSection, id: string, event: DragEvent) => {
			if (!dragId || dragSection !== section) return;
			event.preventDefault();
			const current = ids(section);
			const position = overId === id && dropPosition ? dropPosition : positionFromEvent(event);
			const next = moveToPosition(current, dragId, id, position);
			clearDrag();
			if (next !== current) void persist(section, next);
		},
		dropAtEnd: (section: OrderSection, event: DragEvent) => {
			if (!dragId || dragSection !== section) return;
			event.preventDefault();
			const current = ids(section);
			const dragged = dragId;
			clearDrag();
			if (current.at(-1) === dragged) return;
			void persist(section, [...current.filter((id) => id !== dragged), dragged]);
		},
		dragEnd: () => {
			clearDrag();
		}
	};
}
