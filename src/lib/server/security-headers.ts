const HEADERS: Record<string, string> = {
	'x-content-type-options': 'nosniff',
	'x-frame-options': 'DENY',
	'referrer-policy': 'no-referrer',
	'permissions-policy': 'camera=(), microphone=(), geolocation=()'
};

const HSTS = 'max-age=31536000; includeSubDomains';

export function applySecurityHeaders(headers: Headers, url: URL) {
	for (const [name, value] of Object.entries(HEADERS))
		if (!headers.has(name)) headers.set(name, value);
	if (headers.get('content-type')?.includes('text/html') && !headers.has('cache-control'))
		headers.set('cache-control', 'private, no-transform');
	if (url.protocol === 'https:' && !headers.has('strict-transport-security'))
		headers.set('strict-transport-security', HSTS);
}
