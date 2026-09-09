import type { ServerEvent } from '#lib/shared/types.ts';

type Listener = (event: ServerEvent) => void;
const listeners = new Set<Listener>();

export function subscribe(listener: Listener) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function broadcast(event: ServerEvent) {
	for (const l of listeners) {
		try {
			l(event);
		} catch {
			listeners.delete(l);
		}
	}
}

export const listenerCount = () => listeners.size;
