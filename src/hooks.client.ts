import type { HandleClientError } from '@sveltejs/kit/hooks';

export const handleError: HandleClientError = ({ kind, error }) => {
	const detail =
		error instanceof Error ? (error.stack ?? error.message) : JSON.stringify(error, null, 2);
	console.error(`[client error: ${kind}] ${detail}`);
	if (kind === 'unknown' && error instanceof Error) return { message: error.message };
};
