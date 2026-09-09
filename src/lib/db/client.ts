import { DbClient } from '@tanstack/svelte-db';
import { all } from './collections';
import type { Snapshot } from '#lib/shared/types.ts';

export function createDb(snapshot: Snapshot) {
	const client = new DbClient();
	for (const name of Object.keys(all) as (keyof typeof all)[]) {
		client.collection(all[name] as never, { initialData: snapshot[name] as never });
	}
	return client;
}
