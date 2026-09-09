import { BTreeIndex, collectionOptions } from '@tanstack/svelte-db';
import { browser } from '$app/env';
import { register } from './live.svelte';
import type { CollectionName, RowOf } from '#lib/shared/types.ts';

function define<K extends CollectionName>(name: K) {
	return collectionOptions(name, () => ({
		id: name,
		getKey: (row: RowOf[K]) => row.id,
		startSync: true,
		autoIndex: 'eager' as const,
		defaultIndexType: BTreeIndex,
		sync: {
			rowUpdateMode: 'full' as const,
			sync: ({ begin, write, commit, markReady, truncate }) => {
				markReady();
				if (!browser) return () => {};
				return register(name, { begin, write, commit, truncate });
			}
		}
	}));
}

export const courses = define('courses');
export const courseWork = define('courseWork');
export const materials = define('materials');
export const announcements = define('announcements');
export const topics = define('topics');
export const submissions = define('submissions');
export const dismissals = define('dismissals');

export const all = {
	courses,
	courseWork,
	materials,
	announcements,
	topics,
	submissions,
	dismissals
} as const;
