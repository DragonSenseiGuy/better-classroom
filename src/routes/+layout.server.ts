import type { LayoutServerLoad } from './$types';
import { snapshot } from '#lib/server/store.ts';
import { syncStatus } from '#lib/server/sync.ts';

export const load: LayoutServerLoad = () => ({ snapshot: snapshot(syncStatus()) });
