export type Segment = {
	text: string;
	href?: string;
	bold?: boolean;
	italic?: boolean;
};

type Style = Pick<Segment, 'bold' | 'italic'>;

const URL = /https?:\/\/[^\s<>"'`]+/g;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const BOLD2 = /(?<![\w*])\*\*(?=\S)([^\n]+?)(?<=\S)\*\*(?![\w*])/g;
const BOLD1 = /(?<![\w*])\*(?=\S)([^*\n]+?)\*(?![\w*])/g;
const ITALIC = /(?<!\w)_(?=\S)([^_\n]+?)(?<=\S)_(?!\w)/g;

const TRAILING = /[.,;:!?)\]]+$/;

type Match = { index: number; length: number; segments: (style: Style) => Segment[] };

function earliest(text: string, style: Style): Match | undefined {
	let best: Match | undefined;
	const consider = (m: Match) => {
		if (!best || m.index < best.index) best = m;
	};

	const link = (re: RegExp, href: (s: string) => string) => {
		re.lastIndex = 0;
		const m = re.exec(text);
		if (!m) return;
		let raw = m[0];
		const trimmed = raw.replace(TRAILING, '');
		const open = (trimmed.match(/\(/g) ?? []).length;
		const close = (trimmed.match(/\)/g) ?? []).length;
		raw = open > close && raw.endsWith(')') ? raw.slice(0, trimmed.length + 1) : trimmed;
		if (!raw) return;
		consider({
			index: m.index,
			length: raw.length,
			segments: (s) => [{ text: raw, href: href(raw), ...s }]
		});
	};
	link(URL, (s) => s);
	link(EMAIL, (s) => `mailto:${s}`);

	const wrap = (re: RegExp, extra: Style) => {
		re.lastIndex = 0;
		const m = re.exec(text);
		if (!m) return;
		consider({
			index: m.index,
			length: m[0].length,
			segments: (s) => parse(m[1], { ...s, ...extra })
		});
	};
	wrap(BOLD2, { bold: true });
	wrap(BOLD1, { bold: true });
	wrap(ITALIC, { italic: true });

	return best;
}

function parse(text: string, style: Style): Segment[] {
	const out: Segment[] = [];
	let rest = text;
	while (rest) {
		const m = earliest(rest, style);
		if (!m) {
			out.push({ text: rest, ...style });
			break;
		}
		if (m.index > 0) out.push({ text: rest.slice(0, m.index), ...style });
		out.push(...m.segments(style));
		rest = rest.slice(m.index + m.length);
	}
	return out;
}

export function richSegments(text: string): Segment[] {
	return parse(text, {});
}
