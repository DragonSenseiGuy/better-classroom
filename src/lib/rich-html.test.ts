import { test, expect } from 'bun:test';
import { sanitizeHtml, decodeEntities } from './rich-html.ts';

test('keeps classroom formatting tags', () => {
	expect(sanitizeHtml('<div><b>YEAR 12</b><br><br>Hi <u>there</u> and <i>this</i></div>')).toBe(
		'<div><strong>YEAR 12</strong><br><br>Hi <u>there</u> and <em>this</em></div>'
	);
});

test('lists get tailwind-safe classes', () => {
	expect(sanitizeHtml('<ul><li>a</li><li>b</li></ul>')).toBe(
		'<ul class="my-1 list-disc pl-5"><li>a</li><li>b</li></ul>'
	);
});

test('drops scripts, styles, event handlers and unknown tags but keeps their text', () => {
	expect(
		sanitizeHtml('<script>alert(1)</script><span onclick="x">hi</span><img src=x onerror=1>')
	).toBe('alert(1)hi');
});

test('only safe hrefs survive and get rel/target', () => {
	expect(
		sanitizeHtml('<a href="javascript:alert(1)">x</a> <a href="https://a.b/c?d=1&amp;e=2">y</a>')
	).toBe(
		'x <a href="https://a.b/c?d=1&amp;e=2" target="_blank" rel="noopener noreferrer" class="break-all text-primary underline underline-offset-2 hover:opacity-80">y</a>'
	);
});

test('entities are decoded once and re-escaped', () => {
	expect(decodeEntities('Queen&#39;s &amp; &lt;b&gt;')).toBe("Queen's & <b>");
	expect(sanitizeHtml('Queen&#39;s &amp; &lt;b&gt;')).toBe("Queen's &amp; &lt;b&gt;");
});

test('plain urls and emails in text become links, but not inside anchors', () => {
	expect(sanitizeHtml('see https://x.io now')).toBe(
		'see <a href="https://x.io" target="_blank" rel="noopener noreferrer" class="break-all text-primary underline underline-offset-2 hover:opacity-80">https://x.io</a> now'
	);
	expect(sanitizeHtml('<a href="https://x.io">https://x.io</a>')).toBe(
		'<a href="https://x.io" target="_blank" rel="noopener noreferrer" class="break-all text-primary underline underline-offset-2 hover:opacity-80">https://x.io</a>'
	);
});

test('unbalanced tags are closed and stray closers ignored', () => {
	expect(sanitizeHtml('<b>bold</i> still')).toBe('<strong>bold still</strong>');
	expect(sanitizeHtml('a < b')).toBe('a &lt; b');
});
