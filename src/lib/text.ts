export function initials(name: string | undefined) {
	if (!name) return '?';
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((p) => p[0]!.toUpperCase())
		.join('');
}

export function pluralize(n: number, word: string) {
	return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function greeting(now = new Date()) {
	const h = now.getHours();
	if (h < 12) return 'Good morning';
	if (h < 18) return 'Good afternoon';
	return 'Good evening';
}
