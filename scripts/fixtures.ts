import type { RawCourseContent, RawOverview } from '../src/lib/server/classroom';

const SUBJECTS: readonly (readonly [string, string, readonly string[]])[] = [
	['Mathematics', 'Mr Okafor', ['Algebra', 'Geometry', 'Statistics']],
	['English Literature', 'Ms Larsen', ['Poetry', 'Novels', 'Essays']],
	['Physics', 'Dr Chen', ['Mechanics', 'Waves', 'Electricity']],
	['Chemistry', 'Ms Patel', ['Organic', 'Reactions', 'Lab work']],
	['History', 'Mr Delgado', ['Cold War', 'Revolutions', 'Sources']],
	['Computer Science', 'Ms Novak', ['Python', 'Data structures', 'Theory']],
	['Art & Design', 'Mr Haddad', ['Colour theory', 'Sketchbook', 'Final piece']],
	['Biology', 'Dr Silva', ['Cells', 'Genetics', 'Ecology']]
];

const WORK_TITLES = [
	'Colour theory worksheet',
	'Analyse the behaviour of the pendulum',
	'Organise your revision timetable',
	'Essay: the centre of the novel',
	'Practice questions chapter {n}',
	'Homework {n}: past paper',
	'Lab report: titration',
	'Sketchbook check {n}',
	'Reading response week {n}',
	'Quiz on {topic}',
	'Presentation on {topic}',
	'Mock exam: {topic}',
	'Catalogue of sources',
	'Programme design document',
	'Travelling salesman write-up',
	'Defence of thesis statement',
	'Grey areas in ethics: discussion post',
	'Maths challenge {n}'
];

const ANNOUNCEMENTS = [
	'Reminder: bring your calculators tomorrow, we are doing the statistics unit test.',
	'The trip permission slips are due Friday. Please ask a parent or guardian to sign.',
	'I have uploaded the revision guide to the Materials tab. Focus on chapters 3 to 5.',
	'No lesson on Thursday, I am at a conference. Use the time to finish your coursework.',
	'Great work on the mock exam everyone, results will be returned next week.',
	'Please make sure your name is on every page of your sketchbook.',
	'Extra help session on Wednesday lunchtime in room 14.',
	'The deadline for the essay has been extended by two days.'
];

function rng(seed: number) {
	let s = seed >>> 0;
	return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

const now = Date.now();
const day = 86_400_000;

export function overview(): RawOverview {
	return {
		profile: { id: 'me', name: 'Mahad', email: 'student@example.edu' },
		courses: SUBJECTS.map(([name, teacher], i) => ({
			id: `c${i + 1}`,
			name,
			section: `Year 12 ${String.fromCharCode(65 + i)}`,
			room: `Room ${10 + i}`,
			courseState: 'ACTIVE',
			alternateLink: `https://classroom.google.com/c/c${i + 1}`,
			creationTime: new Date(now - 200 * day).toISOString(),
			updateTime: new Date(now - i * day).toISOString(),
			teachers: [
				{
					userId: `t${i + 1}`,
					name: teacher,
					email: `${teacher.toLowerCase().replace(/\W+/g, '.')}@example.edu`
				}
			]
		}))
	};
}

export function courseContent(
	courseId: string,
	perCourse = 25,
	annPerCourse = 8,
	extraAnnouncements = 0
): RawCourseContent {
	const i = Number(courseId.slice(1)) - 1;
	const topics = SUBJECTS[i]![2];
	const rand = rng(42 + i);
	const pick = <T>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
	const content: RawCourseContent = {
		courseWork: [],
		materials: [],
		announcements: [],
		topics: [],
		submissions: []
	};
	content.topics = topics.map((t, k) => ({
		id: `${courseId}-topic${k}`,
		name: t,
		updateTime: new Date(now - 100 * day).toISOString()
	}));
	for (let n = 0; n < perCourse; n++) {
		const id = `${courseId}-w${n}`;
		const topic = pick(topics);
		const title = pick(WORK_TITLES)
			.replace('{n}', String(n + 1))
			.replace('{topic}', topic);
		const offset = Math.round((rand() - 0.55) * 40);
		const due = new Date(now + offset * day);
		const hasDue = rand() > 0.15;
		const turnedIn = offset < 0 ? rand() > 0.3 : rand() > 0.8;
		const graded = turnedIn && offset < -3 && rand() > 0.4;
		const maxPoints = rand() > 0.3 ? pick([10, 20, 50, 100]) : undefined;
		content.courseWork.push({
			id,
			title,
			description: `${title}. Complete the ${topic.toLowerCase()} task and submit as a PDF. Show all working, explain your reasoning, and cite any sources you used.`,
			materials:
				rand() > 0.5
					? [
							{
								type: 'drive',
								title: `${topic} handout.pdf`,
								url: 'https://drive.google.com/file/d/x'
							}
						]
					: [],
			state: 'PUBLISHED',
			alternateLink: `https://classroom.google.com/c/${courseId}/a/${id}/details`,
			creationTime: new Date(now + (offset - 14) * day).toISOString(),
			updateTime: new Date(now + (offset - 7) * day).toISOString(),
			dueDate: hasDue
				? { year: due.getUTCFullYear(), month: due.getUTCMonth() + 1, day: due.getUTCDate() }
				: undefined,
			dueTime: hasDue && rand() > 0.5 ? { hours: 15, minutes: 30 } : undefined,
			maxPoints,
			workType: rand() > 0.85 ? 'SHORT_ANSWER_QUESTION' : 'ASSIGNMENT',
			topicId: `${courseId}-topic${topics.indexOf(topic)}`,
			creatorUserId: `t${i + 1}`
		});
		content.submissions.push({
			id: `${id}-s`,
			courseWorkId: id,
			state: graded ? 'RETURNED' : turnedIn ? 'TURNED_IN' : 'CREATED',
			late: turnedIn && offset < 0 && rand() > 0.8,
			assignedGrade: graded && maxPoints ? Math.round(maxPoints * (0.5 + rand() * 0.5)) : undefined,
			alternateLink: `https://classroom.google.com/c/${courseId}/a/${id}/submissions`,
			courseWorkType: 'ASSIGNMENT',
			updateTime: new Date(now + (offset - 1) * day).toISOString(),
			attachments: turnedIn
				? [{ type: 'drive', title: `${title}.pdf`, url: 'https://drive.google.com/file/d/y' }]
				: []
		});
	}
	for (let n = 0; n < 4; n++) {
		const topic = pick(topics);
		content.materials.push({
			id: `${courseId}-m${n}`,
			title: `${topic} revision notes ${n + 1}`,
			description: `Notes and worked examples for ${topic.toLowerCase()}.`,
			materials: [
				{ type: 'drive', title: `${topic} notes.pdf`, url: 'https://drive.google.com/file/d/z' },
				{ type: 'youtube', title: `${topic} explained`, url: 'https://youtube.com/watch?v=abc' }
			],
			alternateLink: `https://classroom.google.com/c/${courseId}/m/${courseId}-m${n}/details`,
			creationTime: new Date(now - (30 + n * 10) * day).toISOString(),
			updateTime: new Date(now - (20 + n * 10) * day).toISOString(),
			topicId: `${courseId}-topic${topics.indexOf(topic)}`,
			creatorUserId: `t${i + 1}`
		});
	}
	for (let n = 0; n < annPerCourse; n++) {
		const when = new Date(
			now - Math.floor(rand() * 30) * day - Math.floor(rand() * 20) * 3_600_000
		);
		content.announcements.push({
			id: `${courseId}-a${n}`,
			text: pick(ANNOUNCEMENTS),
			materials: [],
			alternateLink: `https://classroom.google.com/c/${courseId}/p/${courseId}-a${n}`,
			creationTime: when.toISOString(),
			updateTime: when.toISOString(),
			creatorUserId: `t${i + 1}`
		});
	}
	for (let n = 0; n < extraAnnouncements; n++) {
		const when = new Date(Date.now() - (extraAnnouncements - n) * 1000);
		content.announcements.push({
			id: `${courseId}-live${n}`,
			text: `Live update ${n + 1}: this announcement was pushed by the mock sync at ${when.toLocaleTimeString('en-GB')}.`,
			materials: [],
			alternateLink: `https://classroom.google.com/c/${courseId}/p/${courseId}-live${n}`,
			creationTime: when.toISOString(),
			updateTime: when.toISOString(),
			creatorUserId: `t${i + 1}`
		});
	}
	return content;
}

export const courseIds = () => SUBJECTS.map((_, i) => `c${i + 1}`);
