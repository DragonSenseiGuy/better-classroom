import type { RequestHandler } from './$types';
import { subscribe } from '#lib/server/events.ts';
import { syncStatus } from '#lib/server/sync.ts';
import type { ServerEvent } from '#lib/shared/types.ts';

export const GET: RequestHandler = ({ request }) => {
	const encoder = new TextEncoder();
	let unsubscribe = () => {};
	let ping: ReturnType<typeof setInterval>;
	const stream = new ReadableStream({
		start(controller) {
			const send = (event: ServerEvent) =>
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
			send({ type: 'hello', version: syncStatus().version, sync: syncStatus() });
			unsubscribe = subscribe(send);
			ping = setInterval(() => controller.enqueue(encoder.encode(': ping\n\n')), 25_000);
			request.signal.addEventListener('abort', () => {
				unsubscribe();
				clearInterval(ping);
				controller.close();
			});
		},
		cancel() {
			unsubscribe();
			clearInterval(ping);
		}
	});
	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache',
			connection: 'keep-alive'
		}
	});
};
