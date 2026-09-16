export function groupBy<K, T>(items: Iterable<T>, key: (item: T) => K): Map<K, T[]> {
	const out = new Map<K, T[]>();
	for (const item of items) {
		const k = key(item);
		const bucket = out.get(k);
		if (bucket) bucket.push(item);
		else out.set(k, [item]);
	}
	return out;
}
