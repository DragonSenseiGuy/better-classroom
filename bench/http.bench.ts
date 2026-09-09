const base = process.argv[2] ?? 'http://localhost:3000';
const routes = [
	'/',
	'/todo',
	'/courses/c1',
	'/courses/c1/work/c1-w0',
	'/search?q=colour',
	'/settings'
];

async function measure(path: string, n: number, concurrency: number) {
	const times: number[] = [];
	let bytes = 0;
	let next = 0;
	async function worker() {
		while (next < n) {
			next++;
			const t0 = performance.now();
			const res = await fetch(base + path);
			const body = await res.arrayBuffer();
			times.push(performance.now() - t0);
			bytes = body.byteLength;
			if (res.status !== 200) throw new Error(`${path} -> ${res.status}`);
		}
	}
	await Promise.all(Array.from({ length: concurrency }, worker));
	times.sort((a, b) => a - b);
	const p = (f: number) => times[Math.min(times.length - 1, Math.floor(times.length * f))];
	return { p50: p(0.5), p95: p(0.95), max: times[times.length - 1], bytes };
}

for (const r of routes) await fetch(base + r);
for (const [n, concurrency] of [
	[50, 1],
	[200, 20]
] as const) {
	console.log(`\nSSR, ${n} requests per route, concurrency ${concurrency} (${base})`);
	console.log(
		'route'.padEnd(28),
		'p50'.padStart(8),
		'p95'.padStart(8),
		'max'.padStart(8),
		'html'.padStart(9)
	);
	for (const r of routes) {
		const m = await measure(r, n, concurrency);
		console.log(
			r.padEnd(28),
			`${m.p50.toFixed(1)}ms`.padStart(8),
			`${m.p95.toFixed(1)}ms`.padStart(8),
			`${m.max.toFixed(1)}ms`.padStart(8),
			`${(m.bytes / 1024).toFixed(1)}kB`.padStart(9)
		);
	}
}
