import { test, expect } from 'bun:test';
import {
	buildProfileArgs,
	buildStreamArgs,
	encodeCourseId,
	mergeCookies,
	parseMembersPayload,
	parseProfilesPayload,
	parseStreamResponse
} from './classroom-web.ts';
import { parseCoursesHtml } from './course-discovery.ts';

test('merges rotated cookies and drops expired ones', () => {
	expect(
		mergeCookies('SID=a; SIDCC=old; HSID=h', [
			'SIDCC=new; Path=/; Secure',
			'HSID=; Max-Age=0',
			'NEW=x; Domain=.google.com'
		])
	).toBe('SID=a; SIDCC=new; NEW=x');
});

test('course members come from the keyed record', () => {
	expect(
		parseMembersPayload([
			'hrq.crs',
			null,
			[[['805'], null, 1789380345319, { '8': [['s1'], ['s2']], '22': [['t1']], '53': true }]]
		])
	).toEqual({ students: ['s1', 's2'], teachers: ['t1'] });
	expect(parseMembersPayload(['hrq.crs', null, []])).toEqual({ students: [], teachers: [] });
});

test('profile args and parsing', () => {
	expect(buildProfileArgs(['1', '2'])).toBe(
		'[[null,null,1,0],[1,1,null,1,null,1,null,null,1,1,1,1,null,null,1],[[null,[[null,[1]],[null,[2]]]]]]'
	);
	expect(
		parseProfilesPayload([
			'hrq.usr',
			[],
			[
				[['491'], 'Dana Grey', 'dg@example.com', null, '//lh3.googleusercontent.com/a/x=mo'],
				[['492'], '', null, null, null]
			]
		])
	).toEqual([
		{
			id: '491',
			name: 'Dana Grey',
			email: 'dg@example.com',
			photoUrl: 'https://lh3.googleusercontent.com/a/x=mo'
		},
		{ id: '492', name: undefined, email: undefined, photoUrl: undefined }
	]);
});

const item = (id: string, courseId: string, text: string, html?: string) => [
	3,
	null,
	[
		[
			[id, [courseId]],
			1789395973678,
			null,
			[
				[
					null,
					'ABF6',
					null,
					null,
					null,
					null,
					['edu.rt', text, null, null, html ? [null, html] : null]
				]
			]
		]
	]
];

const assignment = (id: string, courseId: string, text: string, html: string) => [
	2,
	[
		[
			[id, [courseId]],
			1784283111869,
			null,
			null,
			['638776461164'],
			'Title',
			null,
			null,
			2,
			[[null, null, null, null, null, null, ['edu.rt', text, null, null, [null, html]]]]
		]
	]
];

const envelope = (payload: unknown) => {
	const inner = JSON.stringify(payload);
	const line = JSON.stringify([
		['wrb.fr', 'pONvgf', inner, null, null, null, 'generic'],
		['di', 57]
	]);
	return `)]}'\n\n${line.length}\n${line}\n25\n[["e",4,null,null,160]]\n`;
};

test('encodes course ids the way Classroom URLs do', () => {
	expect(encodeCourseId('869476118207')).toBe('ODY5NDc2MTE4MjA3');
});

test('builds first and continuation page args', () => {
	expect(buildStreamArgs('123', 10)).toStartWith('[[10,null,1,0],');
	expect(buildStreamArgs('123', 10)).toEndWith(',[[[2,3],[[123]],null,[2]]]]');
	expect(buildStreamArgs('123', 10, 'tok=')).toStartWith('[[10,"tok=",1,0],');
});

test('parses items, html and pagination', () => {
	const text = envelope([
		'hrsi.qr',
		[true, ['EhIS']],
		[
			item('1', '9', 'Plain', '<div>Plain</div>'),
			item('2', '9', 'No html'),
			assignment('3', '9', 'Work', '<div><b>Work</b></div>')
		]
	]);
	expect(parseStreamResponse(text)).toEqual({
		hasMore: true,
		token: 'EhIS',
		items: [
			{
				id: '1',
				courseId: '9',
				text: 'Plain',
				html: '<div>Plain</div>',
				creatorId: undefined,
				kind: 'announcement',
				createdAt: 1789395973678
			},
			{
				id: '2',
				courseId: '9',
				text: 'No html',
				html: undefined,
				creatorId: undefined,
				kind: 'announcement',
				createdAt: 1789395973678
			},
			{
				id: '3',
				courseId: '9',
				text: 'Work',
				html: '<div><b>Work</b></div>',
				creatorId: '638776461164',
				kind: 'courseWork',
				title: 'Title',
				createdAt: 1784283111869
			}
		]
	});
});

test('empty stream', () => {
	expect(parseStreamResponse(envelope(['hrsi.qr', [false]]))).toEqual({
		hasMore: false,
		token: undefined,
		items: []
	});
});

test('rpc error surfaces', () => {
	const line = JSON.stringify([
		['wrb.fr', 'pONvgf', null, null, null, [3, 'PERMISSION_DENIED'], 'generic']
	]);
	expect(() => parseStreamResponse(`)]}'\n\n1\n${line}\n`)).toThrow(/PERMISSION_DENIED/);
});

const b64 = (id: string) => Buffer.from(id).toString('base64');

test('finds courses from card links', () => {
	const html = `
		<a href="/c/${b64('123456789012')}">Biology 101</a>
		<a href="/c/${b64('987654321098')}">Algebra II</a>
		<a href="/settings">Settings</a>`;
	expect(parseCoursesHtml(html)).toEqual([
		{ id: '123456789012', name: 'Biology 101' },
		{ id: '987654321098', name: 'Algebra II' }
	]);
});

test('falls back to id/name pairs and skips noise', () => {
	const html = `["123456789012","Chemistry",["dg@example.com"],["home"]]`;
	expect(parseCoursesHtml(html)).toEqual([{ id: '123456789012', name: 'Chemistry' }]);
});

test('unions card links and embedded pairs', () => {
	const html = `<a href="/c/${b64('111111111111')}">From Link</a>["222222222222","From Pair"]`;
	expect(parseCoursesHtml(html)).toEqual([
		{ id: '111111111111', name: 'From Link' },
		{ id: '222222222222', name: 'From Pair' }
	]);
});

test('empty page finds nothing', () => {
	expect(parseCoursesHtml('<html><body>signed out</body></html>')).toEqual([]);
});

test('decodes entities and numeric refs in course names', () => {
	const html = `<a href="/c/${b64('123456789012')}">Biology &amp; Chemistry &#39;25</a>`;
	expect(parseCoursesHtml(html)).toEqual([{ id: '123456789012', name: "Biology & Chemistry '25" }]);
});

test('finds course names wrapped in nested card markup', () => {
	const html = `<a href="/c/${b64('123456789012')}"><span><div>Biology 101</div></span></a>`;
	expect(parseCoursesHtml(html)).toEqual([{ id: '123456789012', name: 'Biology 101' }]);
});

test('skips card links whose inner text is polluted with extra content', () => {
	const longInner = `Course Name ${'filler '.repeat(40)}`;
	const html =
		`<a href="/c/${b64('123456789012')}"><span>${longInner}</span></a>` +
		`["123456789012","Biology 101"]`;
	expect(parseCoursesHtml(html)).toEqual([{ id: '123456789012', name: 'Biology 101' }]);
});

test('array in the title slot is not mistaken for a title', () => {
	const text = envelope([
		'hrsi.qr',
		[false],
		[
			[
				3,
				null,
				[
					[
						['9', ['42']],
						1789395973678,
						null,
						null,
						null,
						[['nested', 'array']],
						['edu.rt', 'Hello', null, null, [null, '<div>Hello</div>']]
					]
				]
			]
		]
	]);
	expect(parseStreamResponse(text).items).toEqual([
		{
			id: '9',
			courseId: '42',
			text: 'Hello',
			html: '<div>Hello</div>',
			creatorId: undefined,
			kind: 'announcement',
			title: undefined,
			createdAt: 1789395973678
		}
	]);
});
