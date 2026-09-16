import { runSearch } from '../src/lib/server/fuzzy';
import { normalize } from '../src/lib/server/normalize';

const words =
	'colour behaviour organise centre analyse programme catalogue defence grey travelling maths photograph algebra geometry pendulum titration sketchbook revision essay quiz presentation mock exam sources thesis ethics discussion chapter homework reading response week practice questions past paper lab report worksheet'.split(
		' '
	);
const courses = [
	'Mathematics',
	'English Literature',
	'Physics',
	'Chemistry',
	'History',
	'Computer Science',
	'Art & Design',
	'Biology'
];

function rng(seed: number) {
	let s = seed >>> 0;
	return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function makeCorpus(n: number) {
	const rand = rng(7);
	const docs = [];
	const hay = { titles: [] as string[], bodies: [] as string[] };
	for (let i = 0; i < n; i++) {
		const title = Array.from(
			{ length: 3 + Math.floor(rand() * 4) },
			() => words[Math.floor(rand() * words.length)]
		).join(' ');
		const body = Array.from(
			{ length: 30 + Math.floor(rand() * 60) },
			() => words[Math.floor(rand() * words.length)]
		).join(' ');
		const courseName = courses[i % courses.length];
		docs.push({
			id: String(i),
			title,
			courseName,
			updatedAt: i,
			dueAt: undefined as number | undefined
		});
		hay.titles.push(normalize(`${title} ${courseName}`));
		hay.bodies.push(normalize(body));
	}
	return { docs, hay };
}

const queries = [
	'color',
	'colour theory',
	'behavior pendulum',
	'organize revison',
	'centre novel',
	'titration lab',
	'photografh',
	'math challenge',
	'gray ethics',
	'catalog sources',
	'prog',
	'traveling'
];

for (const size of [500, 2000, 10000]) {
	const { docs, hay } = makeCorpus(size);
	for (const q of queries.slice(0, 3)) runSearch(docs, hay, q, 20);
	const times: number[] = [];
	for (let round = 0; round < 5; round++) {
		for (const q of queries) {
			const t0 = performance.now();
			runSearch(docs, hay, q, 20);
			times.push(performance.now() - t0);
		}
	}
	times.sort((a, b) => a - b);
	const p = (f: number) =>
		times[Math.min(times.length - 1, Math.floor(times.length * f))].toFixed(2);
	console.log(
		`${String(size).padStart(6)} docs  median ${p(0.5)} ms  p95 ${p(0.95)} ms  max ${times[times.length - 1].toFixed(2)} ms`
	);
}

const { docs, hay } = makeCorpus(2000);
console.log('\nspelling variants (2000 docs):');
for (const [a, b] of [
	['colour', 'color'],
	['organise', 'organize'],
	['centre', 'center'],
	['analyse', 'analyze'],
	['programme', 'program'],
	['grey', 'gray'],
	['catalogue', 'catalog'],
	['travelling', 'traveling']
]) {
	const ra = runSearch(docs, hay, a, 50).map((h) => h.doc.id);
	const rb = runSearch(docs, hay, b, 50).map((h) => h.doc.id);
	const same = ra.length === rb.length && ra.every((id, i) => id === rb[i]);
	console.log(`  ${a.padEnd(11)} vs ${b.padEnd(10)} ${ra.length} hits, identical: ${same}`);
}
console.log('\ntypos (2000 docs):');
for (const [typo, real] of [
	['revison', 'revision'],
	['photografh', 'photograph'],
	['pendulm', 'pendulum'],
	['algbera', 'algebra']
]) {
	const hits = runSearch(docs, hay, typo, 20);
	const ok = hits.some(
		(h) => h.doc.title.includes(real) || hay.bodies[Number(h.doc.id)].includes(normalize(real))
	);
	console.log(`  ${typo.padEnd(11)} -> ${hits.length} hits, contains "${real}": ${ok}`);
}
