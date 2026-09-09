import { runSearch, type Haystacks } from '#lib/shared/fuzzy.ts';
import { normalize, snippet } from '#lib/shared/normalize.ts';
import type { SearchDoc } from '#lib/shared/types.ts';
import { listAll } from './store';
import { courseLabel } from '#lib/format.ts';

let docs: SearchDoc[] = [];
let hay: Haystacks = { titles: [], bodies: [] };

export function rebuildSearchIndex() {
	const courses = new Map(
		listAll('courses')
			.filter((c) => !c.archived && !c.hidden)
			.map((c) => [c.id, c.nickname || c.name])
	);
	const nextDocs: SearchDoc[] = [];
	const titles: string[] = [];
	const bodies: string[] = [];
	const push = (doc: SearchDoc, body: string) => {
		nextDocs.push(doc);
		titles.push(normalize(`${doc.title} ${doc.courseName}`));
		bodies.push(normalize(body.slice(0, 4000)));
	};
	for (const c of listAll('courses')) {
		if (c.archived || c.hidden) continue;
		push(
			{
				kind: 'course',
				id: c.id,
				courseId: c.id,
				courseName: c.nickname || c.name,
				title: c.nickname || c.name,
				snippet: [courseLabel(c.section), c.room].filter(Boolean).join(' · '),
				href: `/courses/${c.id}`,
				updatedAt: c.updatedAt
			},
			`${c.section ?? ''} ${c.descriptionHeading ?? ''} ${c.description ?? ''} ${c.teachers.map((t) => t.name ?? '').join(' ')}`
		);
	}
	for (const w of listAll('courseWork')) {
		const courseName = courses.get(w.courseId);
		if (courseName === undefined) continue;
		push(
			{
				kind: 'work',
				id: w.id,
				courseId: w.courseId,
				courseName,
				title: w.title,
				snippet: snippet(w.description),
				href: `/courses/${w.courseId}/work/${w.id}`,
				dueAt: w.dueAt,
				updatedAt: w.updatedAt
			},
			w.description ?? ''
		);
	}
	for (const m of listAll('materials')) {
		const courseName = courses.get(m.courseId);
		if (courseName === undefined) continue;
		push(
			{
				kind: 'material',
				id: m.id,
				courseId: m.courseId,
				courseName,
				title: m.title,
				snippet: snippet(m.description),
				href: `/courses/${m.courseId}/material/${m.id}`,
				updatedAt: m.updatedAt
			},
			`${m.description ?? ''} ${m.materials.map((a) => a.title ?? '').join(' ')}`
		);
	}
	for (const a of listAll('announcements')) {
		const courseName = courses.get(a.courseId);
		if (courseName === undefined) continue;
		push(
			{
				kind: 'announcement',
				id: a.id,
				courseId: a.courseId,
				courseName,
				title: snippet(a.text, 90),
				snippet: snippet(a.text),
				href: `/courses/${a.courseId}?tab=stream#a-${a.id}`,
				updatedAt: a.updatedAt
			},
			`${a.text} ${a.materials.map((x) => x.title ?? '').join(' ')}`
		);
	}
	docs = nextDocs;
	hay = { titles, bodies };
}

export function search(q: string, limit = 20) {
	return runSearch(docs, hay, q, limit);
}

export const indexSize = () => docs.length;
