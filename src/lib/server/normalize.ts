const RULES: [RegExp, string][] = [
	[/our\b/g, 'or'],
	[/isation\b/g, 'ization'],
	[/isations\b/g, 'izations'],
	[/ise\b/g, 'ize'],
	[/ises\b/g, 'izes'],
	[/ised\b/g, 'ized'],
	[/ising\b/g, 'izing'],
	[/yse\b/g, 'yze'],
	[/ysed\b/g, 'yzed'],
	[/ysing\b/g, 'yzing'],
	[/ence\b/g, 'ense'],
	[/tre\b/g, 'ter'],
	[/tres\b/g, 'ters'],
	[/ogue\b/g, 'og'],
	[/ogues\b/g, 'ogs'],
	[/ll(ed|ing|er|ers)\b/g, 'l$1'],
	[/mme\b/g, 'm'],
	[/ae/g, 'e'],
	[/oe/g, 'e'],
	[/que\b/g, 'ck'],
	[/grey/g, 'gray'],
	[/maths\b/g, 'math'],
	[/ph\b/g, 'f']
];

export function normalize(text: string): string {
	let s = text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
	s = s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
	for (const [re, rep] of RULES) s = s.replace(re, rep);
	return s.replace(/\s+/g, ' ').trim();
}

export function snippet(text: string | undefined, max = 160): string {
	if (!text) return '';
	const flat = text.replace(/\s+/g, ' ').trim();
	return flat.length > max ? flat.slice(0, max - 1) + '…' : flat;
}
