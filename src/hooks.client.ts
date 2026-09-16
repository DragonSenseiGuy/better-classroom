import type { HandleClientError } from '@sveltejs/kit';

export const handleError: HandleClientError = ({ error, message, status }) => {
	const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(`[client error ${status}] ${message}\n${detail}`);
	return { message: error instanceof Error ? error.message : message };
};
