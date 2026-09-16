import { AsyncLocalStorage } from 'node:async_hooks';

type Tenant = { userId: string };

const storage = new AsyncLocalStorage<Tenant>();

/** Runs `fn` with `userId` as the current tenant; every db() call inside resolves to that user's data. */
export const runAs = <T>(userId: string, fn: () => T): T => storage.run({ userId }, fn);

export const currentUserId = () => storage.getStore()?.userId ?? null;

export function requireUserId(): string {
	const id = currentUserId();
	if (!id) throw new Error('No signed-in user in this context.');
	return id;
}

/** Module-level state that used to be a single global, now one slot per user. */
export function perUser<T>(create: (userId: string) => T) {
	const slots = new Map<string, T>();
	const get = (userId: string = requireUserId()): T => {
		let slot = slots.get(userId);
		if (slot === undefined) {
			slot = create(userId);
			slots.set(userId, slot);
		}
		return slot;
	};
	return Object.assign(get, {
		peek: (userId: string) => slots.get(userId),
		forget: (userId: string) => slots.delete(userId)
	});
}
