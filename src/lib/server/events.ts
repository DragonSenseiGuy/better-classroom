import type { ServerEvent } from '#lib/shared/types.ts';
import { currentUserId } from './tenant';

type Listener = (event: ServerEvent) => void;
const listeners = new Map<string, Set<Listener>>();

export function subscribe(userId: string, listener: Listener) {
	let set = listeners.get(userId);
	if (!set) listeners.set(userId, (set = new Set()));
	set.add(listener);
	return () => {
		set!.delete(listener);
		if (set!.size === 0) listeners.delete(userId);
	};
}

/** Delivers to the current tenant's open streams only. */
export function broadcast(event: ServerEvent) {
	const userId = currentUserId();
	if (!userId) return;
	const set = listeners.get(userId);
	if (!set) return;
	for (const l of set) {
		try {
			l(event);
		} catch {
			set.delete(l);
		}
	}
}
