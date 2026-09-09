import { courseContent, overview } from './fixtures';

const port = Number(process.argv[2] ?? 8787);
const key = process.env.APPS_SCRIPT_KEY ?? 'mock';
let round = 0;
const roundsPerCourse = new Map<string, number>();

Bun.serve({
	port,
	fetch(req) {
		const url = new URL(req.url);
		if (url.searchParams.get('key') !== key)
			return Response.json({ error: 'unauthorized' }, { status: 401 });
		const course = url.searchParams.get('course');
		if (!course) {
			round++;
			console.log(`overview request (round ${round})`);
			return Response.json(overview());
		}
		const n = (roundsPerCourse.get(course) ?? 0) + 1;
		roundsPerCourse.set(course, n);
		return Response.json(courseContent(course, 25, 8, course === 'c1' ? n - 1 : 0));
	}
});
console.log(
	`Mock Apps Script on http://localhost:${port}/?key=${key}  (each sync adds one announcement to course c1)`
);
