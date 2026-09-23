/**
 * Persistence for sidebar section state.
 *
 * The Archived section starts minimized (collapsed). The user's last toggle
 * choice is kept in `localStorage` so it survives reloads; only an explicit
 * `'1'` opens the section.
 */

export const ARCHIVED_OPEN_KEY = 'sidebar.archived.open';

type StorageGetter = Pick<Storage, 'getItem'>;
type StorageSetter = Pick<Storage, 'setItem'>;

/** Load the persisted open state. Defaults to closed when nothing is stored. */
export function loadArchivedOpen(storage: StorageGetter | null | undefined): boolean {
	try {
		return storage?.getItem(ARCHIVED_OPEN_KEY) === '1';
	} catch {
		return false;
	}
}

/** Persist the open state. Never throws — session state still works in-memory. */
export function saveArchivedOpen(storage: StorageSetter | null | undefined, open: boolean): void {
	try {
		storage?.setItem(ARCHIVED_OPEN_KEY, open ? '1' : '0');
	} catch {
		// Storage unavailable (e.g. private mode): sidebar still works for the session.
	}
}
