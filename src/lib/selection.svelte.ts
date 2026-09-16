import { SvelteSet } from 'svelte/reactivity';

export function createSelection(ids: () => string[]) {
	const set = new SvelteSet<string>();
	let anchor = $state<string | null>(null);

	$effect(() => {
		const live = new Set(ids());
		for (const id of set) if (!live.has(id)) set.delete(id);
		if (anchor && !live.has(anchor)) anchor = null;
	});

	const all = () => {
		const n = ids().length;
		return n > 0 && set.size === n;
	};

	return {
		has: (id: string) => set.has(id),
		get size() {
			return set.size;
		},
		get all() {
			return all();
		},
		get some() {
			return set.size > 0 && !all();
		},
		toggle(index: number, shift: boolean) {
			const list = ids();
			const id = list[index];
			if (id === undefined) return;
			const anchorIndex = anchor ? list.indexOf(anchor) : -1;
			if (shift && anchorIndex >= 0) {
				const on = set.has(anchor!);
				const [from, to] = anchorIndex < index ? [anchorIndex, index] : [index, anchorIndex];
				for (let i = from; i <= to; i++) {
					if (on) set.add(list[i]);
					else set.delete(list[i]);
				}
				return;
			}
			if (set.has(id)) set.delete(id);
			else set.add(id);
			anchor = id;
		},
		toggleAll() {
			if (all()) set.clear();
			else for (const id of ids()) set.add(id);
			anchor = null;
		},
		clear() {
			set.clear();
			anchor = null;
		}
	};
}

export type Selection = ReturnType<typeof createSelection>;
