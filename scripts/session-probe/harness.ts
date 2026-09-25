// Session shape probe (throwaway diagnostic, not app code).
//
// Dumps RAW Google Classroom RPC responses to disk so payload shapes
// (due dates, points, materials, grades, timestamps) can be mapped
// without guessing wire formats. READ-ONLY: every call below is a GET
// or a query RPC. Nothing here can turn in, post, upload or delete.
//
// The session cookie comes ONLY from the C_CLASSROOM env var — never
// pass it as an argument (shell history) and never commit captures.
// Captures land in a fresh tmpdir per run; delete it when done.
//
//   export C_CLASSROOM='<whole Cookie header value>'
//   bun scripts/session-probe/harness.ts slots
//   bun scripts/session-probe/harness.ts courses 0
//   bun scripts/session-probe/harness.ts streamraw 0 <courseId> 50
//   python3 scripts/session-probe/analyze.py <capture> > shape.txt
import {
	buildStreamArgs,
	encodeCourseId,
	extractPayload,
	fetchCourseList,
	fetchCourseMembers,
	fetchHomeHtml,
	fetchProfiles,
	parseStreamPayload,
	parseTokens,
	querySubmissionAttachments,
	type CookieJar,
	type WebTokens
} from '../../src/lib/server/classroom-web.ts';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ORIGIN = 'https://classroom.google.com';
const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

const DIR = process.env.PROBE_DIR ?? mkdtempSync(join(tmpdir(), 'bc-probe-'));
const jar: CookieJar = { cookie: process.env.C_CLASSROOM ?? '' };
if (!jar.cookie) throw new Error('C_CLASSROOM is empty — export your Cookie header value first');

const save = (name: string, text: string) => {
	const path = join(DIR, name);
	writeFileSync(path, text);
	console.log(`saved ${path} (${text.length} bytes)`);
};

// Faithful copy of the module-private callRpc() in classroom-web.ts (same
// URL params, headers, body) so full response text can be captured; the app
// itself only keeps 600-char heads.
async function rawRpc(
	authuser: number,
	tokens: WebTokens,
	rpc: string,
	args: string,
	path: string,
	extraHeaders: Record<string, string> = {}
): Promise<string> {
	const url = new URL(`${ORIGIN}/u/${authuser}/_/ClassroomUi/data/batchexecute`);
	url.searchParams.set('rpcids', rpc);
	url.searchParams.set('source-path', path);
	url.searchParams.set('f.sid', tokens.fsid);
	url.searchParams.set('bl', tokens.bl);
	url.searchParams.set('hl', 'en');
	url.searchParams.set('soc-app', '1');
	url.searchParams.set('soc-platform', '1');
	url.searchParams.set('soc-device', '1');
	url.searchParams.set('_reqid', String(100000 + Math.floor(Math.random() * 900000)));
	url.searchParams.set('rt', 'c');
	const freq = JSON.stringify([[[rpc, args, null, 'generic']]]);
	const body = `f.req=${encodeURIComponent(freq)}&at=${encodeURIComponent(tokens.at)}&`;
	const res = await fetch(url, {
		method: 'POST',
		headers: {
			'user-agent': UA,
			'sec-ch-ua': '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
			'sec-ch-ua-mobile': '?0',
			'sec-ch-ua-platform': '"macOS"',
			'accept-language': 'en-GB,en;q=0.9',
			accept: '*/*',
			'sec-fetch-site': 'same-origin',
			'sec-fetch-mode': 'cors',
			'sec-fetch-dest': 'empty',
			cookie: jar.cookie,
			'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
			origin: ORIGIN,
			referer: ORIGIN + path,
			'x-same-domain': '1',
			...extraHeaders
		},
		body,
		redirect: 'manual',
		signal: AbortSignal.timeout(60_000)
	});
	const text = await res.text();
	if (!res.ok) throw new Error(`RPC ${rpc} responded ${res.status}: ${text.slice(0, 200)}`);
	return text;
}

const SUBMISSION_MASK =
	'[null,1,null,1,1,null,1,1,1,null,null,null,1,null,[1],null,null,null,1,1,1,null,null,null,[[1,1]],[[1,1]],[1,[[1,1,[],[null,1,1]],1,1,1]],null,null,null,null,1]';

const subContext = (courseId: string) => ({
	'x-goog-ext-174067345-jspb': '[[1]]',
	'x-goog-ext-53200201-jspb': `[{"444624357":[${courseId}]}]`
});

async function tokensFor(authuser: number): Promise<WebTokens> {
	const { html } = await fetchHomeHtml(jar, authuser);
	return parseTokens(html);
}

async function main() {
	const mode = process.argv[2];
	console.log(`captures go to ${DIR}`);

	if (mode === 'slots') {
		for (let a = 0; a < 5; a++) {
			try {
				const tokens = await tokensFor(a);
				const courses = await fetchCourseList(jar, a, tokens);
				console.log(
					JSON.stringify({ authuser: a, email: tokens.email, courses: courses.length })
				);
			} catch (err) {
				console.log(JSON.stringify({ authuser: a, error: String(err).slice(0, 120) }));
				if (String(err).includes('Redirect')) break;
			}
		}
	} else if (mode === 'courses') {
		const a = Number(process.argv[3]);
		const tokens = await tokensFor(a);
		const courses = await fetchCourseList(jar, a, tokens);
		for (const c of courses)
			console.log(JSON.stringify({ id: c.id, name: c.name, state: c.courseState }));
	} else if (mode === 'streamraw') {
		// Full raw stream envelope for a course (first page). Saves raw text,
		// prints only item ids/kinds (no content).
		const a = Number(process.argv[3]);
		const courseId = String(process.argv[4]);
		const size = Number(process.argv[5] ?? '50');
		const tokens = await tokensFor(a);
		const text = await rawRpc(
			a,
			tokens,
			'pONvgf',
			buildStreamArgs(courseId, size),
			`/u/${a}/c/${encodeCourseId(courseId)}`
		);
		save(`stream-${courseId}.txt`, text);
		const page = parseStreamPayload(extractPayload(text, 'pONvgf'));
		console.log(
			JSON.stringify({
				items: page.items.map((i) => ({ id: i.id, kind: i.kind, createdAt: i.createdAt }))
			})
		);
	} else if (mode === 'members') {
		// Resolve the student's web-side id by email match (for subqueryraw).
		const a = Number(process.argv[3]);
		const courseId = String(process.argv[4]);
		const tokens = await tokensFor(a);
		const members = await fetchCourseMembers(jar, a, tokens, courseId);
		const profiles = await fetchProfiles(jar, a, tokens, [
			...members.students,
			...members.teachers
		]);
		console.log(JSON.stringify({ me: tokens.email }));
		for (const p of profiles)
			if (p.email && tokens.email && p.email.toLowerCase() === tokens.email.toLowerCase())
				console.log(JSON.stringify({ studentId: p.id, name: p.name }));
	} else if (mode === 'subqueryraw') {
		// Full raw Zj93ge submission-query response for one work item.
		const a = Number(process.argv[3]);
		const courseId = String(process.argv[4]);
		const workId = String(process.argv[5]);
		const tokens = await tokensFor(a);
		const text = await rawRpc(
			a,
			tokens,
			'Zj93ge',
			`[[null,null,2,0],${SUBMISSION_MASK},[null,[[${workId},[${courseId}]]],null]]`,
			`/u/${a}/c/${encodeCourseId(courseId)}/a/${encodeCourseId(workId)}/details`,
			subContext(courseId)
		);
		save(`subquery-${workId}.txt`, text);
		const files = await querySubmissionAttachments(jar, a, tokens, workId, courseId);
		console.log(JSON.stringify({ parsedAttachments: files.length }));
	} else {
		throw new Error(`unknown mode ${mode} (slots|courses|streamraw|members|subqueryraw)`);
	}
}

void main();
