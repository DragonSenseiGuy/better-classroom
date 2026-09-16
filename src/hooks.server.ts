import '#lib/server/env-bridge.ts';
import { error, redirect } from '@sveltejs/kit';
import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import {
	SYNC_INTERVAL_MINUTES,
	DATABASE_PATH,
	GOOGLE_CLIENT_ID,
	GOOGLE_CLIENT_SECRET
} from '$app/env/private';
import { auth } from '#lib/server/auth.ts';
import { configure, registerSourceCheck } from '#lib/server/config.ts';
import { googleProvider } from '#lib/server/google.ts';
import { appsScriptProvider } from '#lib/server/classroom.ts';
import { webProvider } from '#lib/server/rich.ts';
import { hasRecordSource, registerProviders } from '#lib/server/providers.ts';
import { startScheduler } from '#lib/server/sync.ts';
import { runAs } from '#lib/server/tenant.ts';

export const init: ServerInit = async () => {
	configure({
		googleClientId: GOOGLE_CLIENT_ID || undefined,
		googleClientSecret: GOOGLE_CLIENT_SECRET || undefined,
		syncIntervalMinutes: SYNC_INTERVAL_MINUTES,
		databasePath: DATABASE_PATH
	});
	registerProviders(googleProvider, appsScriptProvider, webProvider);
	registerSourceCheck(hasRecordSource);
	startScheduler();
};

const PUBLIC = /^\/(login|api\/auth)(\/|$)/;

export const handle: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });
	event.locals.user = session?.user ?? null;
	event.locals.session = session?.session ?? null;

	const { pathname, search } = event.url;
	if (!event.locals.user && !PUBLIC.test(pathname)) {
		if (pathname.startsWith('/api/')) error(401, 'Sign in first.');
		redirect(307, `/login?next=${encodeURIComponent(pathname + search)}`);
	}

	const run = () => svelteKitHandler({ event, resolve, auth, building });
	return event.locals.user ? runAs(event.locals.user.id, run) : run();
};
