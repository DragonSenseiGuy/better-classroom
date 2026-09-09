import {
	applyContent,
	applyCourses,
	saveSyncStatus,
	setProfile,
	getSyncStatus
} from '../src/lib/server/store';
import { shapeContent } from '../src/lib/server/sync';
import { db } from '../src/lib/server/db';
import { courseContent, courseIds, overview } from './fixtures';

const perCourse = Number(process.argv[2] ?? 25);
const annPerCourse = Number(process.argv[3] ?? 8);

for (const table of [
	'courses',
	'courseWork',
	'materials',
	'announcements',
	'topics',
	'submissions',
	'meta'
])
	db().exec(`DELETE FROM ${table}`);
const o = overview();
setProfile({ id: o.profile.id, name: o.profile.name, email: o.profile.email });
applyCourses(
	o.courses.map((c) => ({
		id: c.id,
		name: c.name,
		section: c.section,
		room: c.room,
		courseState: c.courseState,
		alternateLink: c.alternateLink,
		createdAt: Date.parse(c.creationTime!),
		updatedAt: Date.parse(c.updateTime!),
		teachers: c.teachers
	}))
);
for (const id of courseIds()) {
	const shaped = shapeContent(id, courseContent(id, perCourse, annPerCourse));
	for (const table of [
		'courseWork',
		'materials',
		'announcements',
		'topics',
		'submissions'
	] as const)
		applyContent(table, id, shaped[table]);
}
saveSyncStatus({
	...getSyncStatus(),
	status: 'idle',
	finishedAt: Date.now(),
	courseCount: o.courses.length,
	version: 1
});
console.log(
	`Seeded ${o.courses.length} courses with ${perCourse} assignments each into ${db().filename}`
);
