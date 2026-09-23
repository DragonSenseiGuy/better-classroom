import { error, redirect } from '@sveltejs/kit';
import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import {
	BETTER_AUTH_SECRET,
	DATABASE_PATH,
	FULL_SYNC_HOURS,
	SYNC_CONCURRENCY,
	SYNC_INTERVAL_MINUTES,
	VAPID_PRIVATE_KEY,
	VAPID_PUBLIC_KEY,
	VAPID_SUBJECT
} from '$app/env/private';
import { getAuth } from '#lib/server/auth.ts';
import { configure, registerSourceCheck } from '#lib/server/config.ts';
import { appsScriptProvider } from '#lib/server/apps-script.ts';
import { webRecordsProvider } from '#lib/server/web-records.ts';
import { webProvider } from '#lib/server/rich.ts';
import { hasRecordSource, registerProviders } from '#lib/server/providers.ts';
import { configurePush } from '#lib/server/push.ts';
import { configureSecrets } from '#lib/server/secrets.ts';
import { applySecurityHeaders } from '#lib/server/security-headers.ts';
import { startScheduler } from '#lib/server/sync.ts';
import { runAs } from '#lib/server/tenant.ts';

export const init: ServerInit = async () => {
	configureSecrets(BETTER_AUTH_SECRET);
	configure({
		databasePath: DATABASE_PATH,
		syncIntervalMinutes: SYNC_INTERVAL_MINUTES,
		syncConcurrency: SYNC_CONCURRENCY,
		fullSyncHours: FULL_SYNC_HOURS
	});
	configurePush({
		publicKey: VAPID_PUBLIC_KEY,
		privateKey: VAPID_PRIVATE_KEY,
		subject: VAPID_SUBJECT
	});
	registerProviders(appsScriptProvider, webRecordsProvider, webProvider);
	registerSourceCheck(hasRecordSource);
	if (process.env.VERCEL && !building) {
		// Serverless instances start from a blank ephemeral disk, so there is no
		// deploy step that can run `bun run auth:migrate`. Create the Better Auth
		// tables on cold start instead (a no-op when they already exist).
		// Skipped during `vite build` route analysis, which only imports this module.
		await (await getAuth().$context).runMigrations();
	}
	startScheduler();
};

const PUBLIC = /^\/(login|privacy|api\/auth)(\/|$)/;

export const handle: Handle = async ({ event, resolve }) => {
	const auth = getAuth();
	const session = await auth.api.getSession({ headers: event.request.headers });
	event.locals.user = session?.user ?? null;
	event.locals.session = session?.session ?? null;

	const { pathname, search } = event.url;
	if (!event.locals.user && !PUBLIC.test(pathname)) {
		if (pathname.startsWith('/api/')) error(401, 'Sign in first.');
		redirect(307, `/login?next=${encodeURIComponent(pathname + search)}`);
	}

	const run = () => svelteKitHandler({ event, resolve, auth, building });
	const response = await (event.locals.user ? runAs(event.locals.user.id, run) : run());
	applySecurityHeaders(response.headers, event.url);
	return response;
};
