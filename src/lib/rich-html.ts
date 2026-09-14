import { richSegments, type Segment } from './rich-text.ts';

const OPEN: Record<string, string> = {
	b: '<strong>',
	strong: '<strong>',
	i: '<em>',
	em: '<em>',
	u: '<u>',
	div: '<div>',
	p: '<p>',
	ul: '<ul class="my-1 list-disc pl-5">',
	ol: '<ol class="my-1 list-decimal pl-5">',
	li: '<li>'
};
const CLOSE: Record<string, string> = {
	b: '</strong>',
	strong: '</strong>',
	i: '</em>',
	em: '</em>',
	u: '</u>',
	div: '</div>',
	p: '</p>',
	ul: '</ul>',
	ol: '</ol>',
	li: '</li>',
	a: '</a>'
};

export const LINK_CLASS = 'break-all text-primary underline underline-offset-2 hover:opacity-80';

const ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' '
};

export function decodeEntities(s: string): string {
	return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
		if (code[0] === '#') {
			const n =
				code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
			return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : m;
		}
		return ENTITIES[code.toLowerCase()] ?? m;
	});
}

export const escapeHtml = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function safeHref(raw: string): string | null {
	const href = decodeEntities(raw).trim();
	return /^(https?:\/\/|mailto:)/i.test(href) ? href : null;
}

function renderSegment(s: Segment, linkable: boolean): string {
	const text = escapeHtml(s.text);
	if (s.href && linkable) {
		const cls = LINK_CLASS + (s.bold ? ' font-semibold' : '') + (s.italic ? ' italic' : '');
		return `<a href="${escapeHtml(s.href)}" target="_blank" rel="noopener noreferrer" class="${cls}">${text}</a>`;
	}
	let out = text;
	if (s.italic) out = `<em>${out}</em>`;
	if (s.bold) out = `<strong>${out}</strong>`;
	return out;
}

export function sanitizeHtml(html: string): string {
	const out: string[] = [];
	const stack: string[] = [];
	let inAnchor = 0;
	const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|([^<]+)|(<)/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(html))) {
		if (m[3] !== undefined || m[4] !== undefined) {
			const text = decodeEntities(m[3] ?? '<');
			for (const seg of richSegments(text)) out.push(renderSegment(seg, inAnchor === 0));
			continue;
		}
		const tag = m[1].toLowerCase();
		const closing = m[0][1] === '/';
		if (tag === 'br') {
			if (!closing) out.push('<br>');
			continue;
		}
		if (closing) {
			const i = stack.lastIndexOf(tag);
			if (i === -1) continue;
			while (stack.length > i) {
				const t = stack.pop()!;
				if (t === 'a') inAnchor--;
				out.push(CLOSE[t]);
			}
			continue;
		}
		if (tag === 'a') {
			const attr = m[2].match(/href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
			const href = attr && safeHref(attr[1] ?? attr[2] ?? attr[3] ?? '');
			if (!href) continue;
			out.push(
				`<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" class="${LINK_CLASS}">`
			);
			stack.push('a');
			inAnchor++;
			continue;
		}
		if (!(tag in OPEN)) continue;
		if (m[2].trimEnd().endsWith('/')) continue;
		out.push(OPEN[tag]);
		stack.push(tag);
	}
	while (stack.length) {
		const t = stack.pop()!;
		out.push(CLOSE[t]);
	}
	return out.join('');
}
