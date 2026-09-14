import { test, expect } from 'bun:test';
import { richSegments } from './rich-text.ts';

test('plain text passes through', () => {
	expect(richSegments('hello\nworld')).toEqual([{ text: 'hello\nworld' }]);
});

test('single and double asterisks are bold', () => {
	expect(richSegments('04 09 26 *LAST CALL* now')).toEqual([
		{ text: '04 09 26 ' },
		{ text: 'LAST CALL', bold: true },
		{ text: ' now' }
	]);
	expect(richSegments('**LAST ORDERS** Parent Pay')).toEqual([
		{ text: 'LAST ORDERS', bold: true },
		{ text: ' Parent Pay' }
	]);
});

test('closing asterisk may follow a space', () => {
	expect(richSegments('*PLEASE EMAIL *')).toEqual([{ text: 'PLEASE EMAIL ', bold: true }]);
});

test('arithmetic and mid-word asterisks are left alone', () => {
	expect(richSegments('2 * 3 = 6 and 4 * 5')).toEqual([{ text: '2 * 3 = 6 and 4 * 5' }]);
	expect(richSegments('an A* grade')).toEqual([{ text: 'an A* grade' }]);
});

test('bold does not span lines', () => {
	expect(richSegments('*one\ntwo*')).toEqual([{ text: '*one\ntwo*' }]);
});

test('underscores are italic only at word boundaries', () => {
	expect(richSegments('_soon_ file_name_here')).toEqual([
		{ text: 'soon', italic: true },
		{ text: ' file_name_here' }
	]);
});

test('urls and emails become links, trailing punctuation excluded', () => {
	expect(richSegments('see https://example.com/a?b=1. Email ta@example.com, thanks')).toEqual([
		{ text: 'see ' },
		{ text: 'https://example.com/a?b=1', href: 'https://example.com/a?b=1' },
		{ text: '. Email ' },
		{ text: 'ta@example.com', href: 'mailto:ta@example.com' },
		{ text: ', thanks' }
	]);
});

test('balanced parentheses stay in the url', () => {
	expect(richSegments('(https://en.wikipedia.org/wiki/Foo_(bar))')).toEqual([
		{ text: '(' },
		{
			text: 'https://en.wikipedia.org/wiki/Foo_(bar)',
			href: 'https://en.wikipedia.org/wiki/Foo_(bar)'
		},
		{ text: ')' }
	]);
});

test('links inside bold keep both', () => {
	expect(richSegments('*go to https://x.io now*')).toEqual([
		{ text: 'go to ', bold: true },
		{ text: 'https://x.io', href: 'https://x.io', bold: true },
		{ text: ' now', bold: true }
	]);
});
