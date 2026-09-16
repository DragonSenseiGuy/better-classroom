import type { HandleClientError } from '@sveltejs/kit/hooks';

function describe(error: unknown): string {
	if (error instanceof Error) return error.stack ?? error.message;
	if (error === null || typeof error !== 'object') return String(error);
	const tag = Object.prototype.toString.call(error);
	const ctor = (error as { constructor?: { name?: string } }).constructor?.name;
	const props = Object.getOwnPropertyNames(error)
		.map((k) => `${k}=${String((error as Record<string, unknown>)[k]).slice(0, 200)}`)
		.join(', ');
	return `${tag} ${ctor ?? ''} {${props}} ${String(error)}`;
}

export const handleError: HandleClientError = ({ kind, error }) => {
	console.error(`[client error: ${kind}] ${describe(error)}`, error);
	if (kind === 'unknown' && error instanceof Error) return { message: error.message };
};
