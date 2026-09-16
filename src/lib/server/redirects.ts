export function safeNext(value: string | null, origin: string): string {
	if (!value || !value.startsWith('/')) return '/';
	let resolved: URL;
	try {
		resolved = new URL(value, origin);
	} catch {
		return '/';
	}
	if (resolved.origin !== origin || resolved.pathname === '/login') return '/';
	return resolved.pathname + resolved.search + resolved.hash;
}
