import { errorMessage } from './http';
import { getConnection } from './store';
import type {
	Provider,
	RawCourseContent,
	RawLookup,
	RawOverview,
	RawSubmissionAction
} from './providers';

const ATTEMPTS = 3;

type Ping = {
	ok: true;
	profile: { id: string; name?: string; email?: string; photoUrl?: string };
	courseCount: number;
};

export type ConnectionTest =
	| { ok: true; name?: string; email?: string; courseCount: number }
	| {
			ok: false;
			code: 'url' | 'access' | 'key' | 'manifest' | 'script' | 'network';
			message: string;
	  };

const WEB_APP_URL = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;

export async function testConnection(url: string, key: string): Promise<ConnectionTest> {
	if (!WEB_APP_URL.test(url.trim()))
		return {
			ok: false,
			code: 'url',
			message:
				'That is not a web app URL. It starts with https://script.google.com/macros/s/ and ends with /exec.'
		};
	const target = new URL(url.trim());
	target.searchParams.set('key', key);
	target.searchParams.set('ping', '1');
	let res: Response;
	let text: string;
	try {
		res = await fetch(target, { redirect: 'follow', signal: AbortSignal.timeout(60_000) });
		text = await res.text();
	} catch (err) {
		return {
			ok: false,
			code: 'network',
			message: `Could not reach Google: ${errorMessage(err)}`
		};
	}
	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		if (/accounts\.google\.com|ServiceLogin|sign in/i.test(text))
			return {
				ok: false,
				code: 'access',
				message:
					'Google asked for a sign-in. In the deployment, set “Who has access” to Anyone, not “Anyone with Google account”.'
			};
		if (res.status === 404 || /unable to open|not found/i.test(text))
			return {
				ok: false,
				code: 'url',
				message:
					'Google could not find that deployment. Copy the URL from Deploy → Manage deployments.'
			};
		return {
			ok: false,
			code: 'script',
			message: `Unexpected response (${res.status}): ${text
				.replace(/<[^>]+>/g, ' ')
				.trim()
				.slice(0, 160)}`
		};
	}
	if (body && typeof body === 'object' && 'error' in body) {
		const error = String((body as { error: unknown }).error);
		if (/unauthorized/i.test(error))
			return {
				ok: false,
				code: 'key',
				message:
					'The key in the script does not match. Paste Code.gs again from step 1, then deploy a new version.'
			};
		if (/Classroom is not defined|not enabled|advanced service/i.test(error))
			return {
				ok: false,
				code: 'manifest',
				message:
					'The Classroom service is not enabled. Paste appsscript.json from step 1, then deploy a new version.'
			};
		return { ok: false, code: 'script', message: error };
	}
	const ping = body as Partial<Ping>;
	if (!ping.ok || !ping.profile)
		return {
			ok: false,
			code: 'script',
			message:
				'The script replied, but not with the expected ping. Paste the latest Code.gs and redeploy.'
		};
	return {
		ok: true,
		name: ping.profile.name,
		email: ping.profile.email,
		courseCount: ping.courseCount ?? 0
	};
}

export async function fetchAppsScript<T>(params: Record<string, string>): Promise<T> {
	const connection = getConnection();
	if (!connection) throw new Error('Apps Script is not connected. Finish setup at /setup.');
	const url = new URL(connection.url);
	url.searchParams.set('key', connection.key);
	for (const [k, val] of Object.entries(params)) url.searchParams.set(k, val);
	let lastError: Error = new Error('Apps Script request failed');
	for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
		try {
			return await fetchOnce<T>(url);
		} catch (err) {
			lastError = err instanceof Error ? err : new Error(String(err));
			if (
				!lastError.message.startsWith('Apps Script returned non-JSON') &&
				!lastError.message.includes('timed out')
			)
				throw lastError;
			if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 2000 * attempt));
		}
	}
	throw lastError;
}

async function fetchOnce<T>(url: URL): Promise<T> {
	const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(180_000) });
	const text = await res.text();
	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		throw new Error(`Apps Script returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
	}
	if (body && typeof body === 'object' && 'error' in body) {
		throw new Error(`Apps Script error: ${(body as { error: string }).error}`);
	}
	return body as T;
}

const sinceParam = (since: number): Record<string, string> =>
	since ? { since: String(since) } : {};

export const appsScriptProvider: Provider = {
	status: () => {
		const connection = getConnection();
		return {
			id: 'apps-script',
			label: 'Apps Script',
			role: 'records',
			state: connection ? 'ready' : 'off',
			active: false,
			detail: connection
				? connection.url.replace('https://script.google.com/macros/s/', '…/').replace(/\/exec$/, '')
				: 'Not set up.'
		};
	},
	records: {
		overview: (since) => fetchAppsScript<RawOverview>(sinceParam(since)),
		courseContent: (courseId, since, wantSubmissions) =>
			fetchAppsScript<RawCourseContent>({
				course: courseId,
				...sinceParam(since),
				...(since && !wantSubmissions ? { work: '0' } : {})
			}),
		lookup: (courseId, users) =>
			fetchAppsScript<RawLookup>({
				course: courseId,
				lookup: '1',
				...(users.length ? { users: users.join(',') } : {})
			}),
		submissionAction: (action, courseId, workId, submissionId) =>
			fetchAppsScript<RawSubmissionAction>({
				action,
				course: courseId,
				work: workId,
				submission: submissionId
			})
	}
};
