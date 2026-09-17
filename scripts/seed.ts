import {
	applyContent,
	applyCourses,
	saveSyncStatus,
	setProfile,
	getSyncStatus
} from '../src/lib/server/store';
import { shapeContent } from '../src/lib/server/sync';
import { db, listUserIds } from '../src/lib/server/db';
import { configure } from '../src/lib/server/config';
import { readEnv } from '../src/lib/server/read-env';
import { runAs } from '../src/lib/server/tenant';
import { courseContent, courseIds, overview } from './fixtures';

const env = readEnv();
configure({ databasePath: env.DATABASE_PATH });

const perCourse = Number(process.argv[2] ?? 25);
const annPerCourse = Number(process.argv[3] ?? 8);
const userId = env.SEED_USER ?? listUserIds()[0];
if (!userId) {
	console.error('No accounts yet. Sign up in the app first, or pass SEED_USER=<user id>.');
	process.exit(1);
}

runAs(userId, seed);

function seed() {
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
		`Seeded ${o.courses.length} courses with ${perCourse} assignments each for user ${userId}`
	);
}
