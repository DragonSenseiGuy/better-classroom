import { test, expect } from 'bun:test';
import { buildStreamArgs, encodeCourseId, parseStreamResponse } from './classroom-web.ts';

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
			{ id: '1', courseId: '9', text: 'Plain', html: '<div>Plain</div>' },
			{ id: '2', courseId: '9', text: 'No html', html: undefined },
			{ id: '3', courseId: '9', text: 'Work', html: '<div><b>Work</b></div>' }
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
