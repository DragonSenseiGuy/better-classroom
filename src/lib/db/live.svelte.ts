import type {
	Change,
	CollectionName,
	ServerEvent,
	Snapshot,
	SyncStatus
} from '#lib/shared/types.ts';

type Writer = {
	begin: () => void;
	write: (message: { type: 'insert' | 'update' | 'delete'; key?: string; value: object }) => void;
	commit: () => void;
	truncate: () => void;
};

const writers = new Map<CollectionName, Writer>();
let source: EventSource | undefined;
let version: number | undefined;
let resyncing: Promise<void> | null = null;

export const live = $state<{ sync: SyncStatus | null; connected: boolean }>({
	sync: null,
	connected: false
});

export function primeLive(sync: SyncStatus) {
	live.sync = sync;
	version = sync.version;
}

export function register(name: CollectionName, writer: Writer) {
	writers.set(name, writer);
	connect();
	return () => {
		writers.delete(name);
	};
}

function connect() {
	if (source || typeof EventSource === 'undefined') return;
	source = new EventSource('/api/events');
	source.onopen = () => (live.connected = true);
	source.onerror = () => (live.connected = false);
	source.onmessage = (e) => handle(JSON.parse(e.data) as ServerEvent);
}

function handle(event: ServerEvent) {
	switch (event.type) {
		case 'hello':
			live.sync = event.sync;
			if (version !== undefined && version !== event.version) void resync();
			version = event.version;
			return;
		case 'sync':
			live.sync = event.sync;
			return;
		case 'changes':
			if (version !== undefined && event.version !== version + 1) {
				void resync();
				return;
			}
			version = event.version;
			apply(event.collection, event.changes);
			return;
	}
}

function apply(name: CollectionName, changes: Change[]) {
	const w = writers.get(name);
	if (!w) return;
	w.begin();
	for (const c of changes) w.write({ type: c.type, key: c.key, value: c.value as object });
	w.commit();
}

async function resync() {
	if (resyncing) return resyncing;
	resyncing = (async () => {
		const snap = (await fetch('/api/snapshot').then((r) => r.json())) as Snapshot;
		for (const [name, w] of writers) {
			w.begin();
			w.truncate();
			for (const row of snap[name]) w.write({ type: 'insert', value: row });
			w.commit();
		}
		version = snap.sync.version;
		live.sync = snap.sync;
	})().finally(() => (resyncing = null));
	return resyncing;
}
