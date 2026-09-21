<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import CopyBlock from './copy-block.svelte';
	import SessionForm from './session-form.svelte';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import LoaderIcon from '@lucide/svelte/icons/loader-circle';
	import PartyPopperIcon from '@lucide/svelte/icons/party-popper';

	let { data } = $props();

	const STORAGE = 'classroom:setup';
	const steps = [
		{ title: 'Paste the script', short: 'Script' },
		{ title: 'Deploy it', short: 'Deploy' },
		{ title: 'Connect', short: 'Connect' }
	];

	let step = $state(0);
	let key = $state('');
	let url = $state('');
	// Independent flags so each connect button spins/disables on its own
	// request; the two endpoints are independent and either may be retried
	// while the other is in flight.
	let scriptPending = $state(false);
	let sessionPending = $state(false);
	let useSession = $state(false);
	let cookie = $state('');
	let scriptError = $state<{ code: string; message: string } | null>(null);
	let sessionError = $state<{ code: string; message: string } | null>(null);
	let result = $state<
		| { ok: true; kind: 'script'; name?: string; email?: string; courseCount: number }
		| { ok: true; kind: 'session'; email?: string }
		| null
	>(null);
	let done = $state(false);

	function makeKey() {
		const bytes = crypto.getRandomValues(new Uint8Array(16));
		return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
	}

	onMount(() => {
		try {
			const saved = JSON.parse(localStorage.getItem(STORAGE) ?? 'null');
			if (saved?.key) {
				key = saved.key;
				step = Math.min(saved.step ?? 0, steps.length - 1);
				url = saved.url ?? '';
			}
		} catch {}
		if (!key) key = makeKey();
	});

	$effect(() => {
		if (!key) return;
		try {
			localStorage.setItem(STORAGE, JSON.stringify({ key, step, url }));
		} catch {}
	});

	const codeSource = $derived(
		data.appsScriptSource.replace("const KEY = '';", `const KEY = '${key}';`)
	);

	const fixStep: Record<string, number> = { key: 0, manifest: 0, url: 1, access: 1 };

	async function postJson<T>(path: string, body: unknown): Promise<T> {
		const res = await fetch(path, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		return (await res.json()) as T;
	}

	function finishOk() {
		done = true;
		try {
			localStorage.removeItem(STORAGE);
		} catch {}
	}

	type ConfigResponse =
		| { ok: true; name?: string; email?: string; courseCount: number }
		| { ok: false; code: string; message: string };
	type SessionResponse =
		{ ok: true; email?: string } | { ok: false; code: string; message: string };

	type ConnectKind = 'script' | 'session';

	async function runConnect(kind: ConnectKind, fn: () => Promise<void>) {
		if (kind === 'script') scriptPending = true;
		else sessionPending = true;
		if (kind === 'script') scriptError = null;
		else sessionError = null;
		try {
			await fn();
		} catch (err) {
			const failure = { code: 'network', message: String(err) };
			if (kind === 'script') scriptError = failure;
			else sessionError = failure;
		} finally {
			if (kind === 'script') scriptPending = false;
			else sessionPending = false;
		}
	}

	async function connectScript() {
		await runConnect('script', async () => {
			const body = await postJson<ConfigResponse>('/api/config', { url, key });
			if (body.ok) {
				result = {
					ok: true,
					kind: 'script',
					name: body.name,
					email: body.email,
					courseCount: body.courseCount ?? 0
				};
				finishOk();
			} else
				scriptError = {
					code: body.code ?? 'unknown',
					message: body.message ?? 'That connection did not work.'
				};
		});
	}

	async function connectSession() {
		await runConnect('session', async () => {
			const body = await postJson<SessionResponse>('/api/session', { cookie });
			if (body.ok) {
				result = { ok: true, kind: 'session', email: body.email };
				finishOk();
			} else
				sessionError = {
					code: body.code ?? 'unknown',
					message: body.message ?? 'That cookie did not work.'
				};
		});
	}
</script>

<div class="mx-auto flex min-h-svh w-full max-w-xl flex-col px-4 py-10 sm:px-6">
	<div class="mb-8">
		<h1 class="mt-1 text-2xl font-semibold tracking-tight text-balance">
			{done ? 'You’re connected' : 'Connect your Google Classroom'}
		</h1>
		<p class="mt-1 max-w-[60ch] text-sm text-pretty text-muted-foreground">
			{#if done}
				Your first sync is running in the background. It takes a minute or two.
			{:else}
				Estimated time: 6 minutes
			{/if}
		</p>
		{#if data.configured && !done}
			<p
				class="mt-3 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
			>
				Already connected. Finishing this replaces the current connection.
				<a href="/settings" class="ml-1 font-medium underline underline-offset-2"
					>Back to settings</a
				>
			</p>
		{/if}
	</div>

	{#if !done}
		<ol class="mb-6 flex items-center gap-2 text-xs">
			{#each steps as s, i (i)}
				{@const state = i < step ? 'done' : i === step ? 'current' : 'todo'}
				<li class="flex items-center gap-2">
					<button
						type="button"
						class={`flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1 transition-colors ${
							state === 'current'
								? 'bg-foreground text-background'
								: state === 'done'
									? 'text-foreground hover:bg-muted'
									: 'text-muted-foreground'
						}`}
						disabled={state === 'todo'}
						onclick={() => (step = i)}
					>
						<span
							class={`flex size-5 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums ${
								state === 'current'
									? 'bg-background/20'
									: state === 'done'
										? 'bg-emerald-500 text-white'
										: 'bg-muted'
							}`}
						>
							{#if state === 'done'}<CheckIcon class="size-3" />{:else}{i + 1}{/if}
						</span>
						{s.short}
					</button>
					{#if i < steps.length - 1}<span class="h-px w-4 bg-border"></span>{/if}
				</li>
			{/each}
		</ol>
	{/if}

	<div class="rounded-xl bg-card p-5 ring-1 ring-foreground/10 sm:p-6">
		{#if done && result?.ok}
			<div class="flex flex-col items-center py-6 text-center">
				<span
					class="flex size-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
				>
					<PartyPopperIcon class="size-6" />
				</span>
				<p class="mt-4 font-medium">
					{result.kind === 'script' ? (result.name ?? 'Connected') : 'Connected'}
				</p>
				{#if result.email}<p class="text-sm text-muted-foreground">{result.email}</p>{/if}
				<p class="mt-3 text-sm text-muted-foreground">
					{#if result.kind === 'session'}
						Your courses are syncing now — this page updates as they arrive.
					{:else}
						Syncing {result.courseCount} active {result.courseCount === 1 ? 'course' : 'courses'}.
					{/if}
				</p>
				<Button class="mt-6" onclick={() => (window.location.href = '/')}>
					Open Classroom<ArrowRightIcon data-icon="inline-end" />
				</Button>
			</div>
		{:else if step === 0}
			<h2 class="font-semibold">{steps[0].title}</h2>
			<ol class="mt-4 space-y-4 text-sm">
				<li class="flex gap-3">
					<span
						class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground tabular-nums"
						>1</span
					>
					<div>
						Open
						<a
							href="https://script.google.com/home/projects/create"
							target="_blank"
							rel="noreferrer"
							class="inline-flex items-center gap-0.5 font-medium underline underline-offset-2"
							>script.google.com<ExternalLinkIcon class="size-3" /></a
						>
						with your school account. It creates a new project for you.
					</div>
				</li>
				<li class="flex gap-3">
					<span
						class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground tabular-nums"
						>2</span
					>
					<div>
						Click the gear <span class="text-muted-foreground">(Project settings)</span> and tick
						<strong>Show “appsscript.json” manifest file in editor</strong>.
					</div>
				</li>
				<li class="flex gap-3">
					<span
						class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground tabular-nums"
						>3</span
					>
					<div class="min-w-0 flex-1 space-y-2">
						<p>
							Back in the editor, replace everything in <code
								class="rounded bg-muted px-1 py-0.5 text-xs">Code.gs</code
							> with this:
						</p>
						<CopyBlock name="Code.gs" source={codeSource} />
					</div>
				</li>
				<li class="flex gap-3">
					<span
						class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground tabular-nums"
						>4</span
					>
					<div class="min-w-0 flex-1 space-y-2">
						<p>
							Then replace everything in <code class="rounded bg-muted px-1 py-0.5 text-xs"
								>appsscript.json</code
							> with this:
						</p>
						<CopyBlock name="appsscript.json" source={data.manifestSource} />
					</div>
				</li>
			</ol>
		{:else if step === 1}
			<h2 class="font-semibold">{steps[1].title}</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				Deploying turns the script into a private URL this app can call.
			</p>
			<ol class="mt-4 space-y-4 text-sm">
				<li class="flex gap-3">
					<span
						class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground tabular-nums"
						>1</span
					>
					<div>Press <strong>Deploy</strong> (top right) → <strong>New deployment</strong>.</div>
				</li>
				<li class="flex gap-3">
					<span
						class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground tabular-nums"
						>2</span
					>
					<div>Click the gear next to “Select type” and choose <strong>Web app</strong>.</div>
				</li>
				<li class="flex gap-3">
					<span
						class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground tabular-nums"
						>3</span
					>
					<div>
						Set <strong>Execute as</strong> to <em>Me</em> and <strong>Who has access</strong> to
						<em>Anyone</em>.
						<span class="text-muted-foreground">Not “Anyone with Google account”.</span>
					</div>
				</li>
				<li class="flex gap-3">
					<span
						class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground tabular-nums"
						>4</span
					>
					<div>
						Press <strong>Deploy</strong>, then <strong>Authorize access</strong> and approve the
						permissions.
						<span class="text-muted-foreground"
							>If Google says the app isn’t verified, click Advanced → Go to Untitled project.</span
						>
					</div>
				</li>
				<li class="flex gap-3">
					<span
						class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground tabular-nums"
						>5</span
					>
					<div>Copy the <strong>Web app URL</strong>. You’ll paste it in the next step.</div>
				</li>
			</ol>
		{:else}
			<h2 class="font-semibold">{steps[2].title}</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				Paste the web app URL. We’ll call the script once to check it answers as you.
			</p>
			<form
				class="mt-4 flex flex-col gap-2 sm:flex-row"
				onsubmit={(e) => {
					e.preventDefault();
					connectScript();
				}}
			>
				<Input
					bind:value={url}
					type="url"
					name="url"
					placeholder="https://script.google.com/macros/s/…/exec"
					autocomplete="off"
					spellcheck={false}
					aria-invalid={scriptError ? true : undefined}
					class="font-mono text-xs sm:text-xs"
				/>
				<Button type="submit" disabled={scriptPending || !url} class="shrink-0">
					{#if scriptPending}<LoaderIcon
							data-icon="inline-start"
							class="animate-spin"
						/>Checking{:else}Test and connect{/if}
				</Button>
			</form>
			{#if scriptError}
				{@const target = fixStep[scriptError.code]}
				<div class="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
					<p>{scriptError.message}</p>
					{#if target !== undefined}
						<button
							type="button"
							class="mt-1 text-xs font-medium underline underline-offset-2"
							onclick={() => (step = target)}
						>
							Go back to step {target + 1}
						</button>
					{/if}
				</div>
			{/if}
		{/if}
	</div>

	{#if !done}
		<div class="mt-4 flex items-center justify-between">
			<Button variant="ghost" size="sm" disabled={step === 0} onclick={() => step--}>
				<ArrowLeftIcon data-icon="inline-start" />Back
			</Button>
			{#if step < steps.length - 1}
				<Button size="sm" onclick={() => step++}>
					{step === 0 ? 'I’ve pasted both' : 'I have the URL'}<ArrowRightIcon
						data-icon="inline-end"
					/>
				</Button>
			{/if}
		</div>
		<div class="mt-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10 sm:p-6">
			<button
				type="button"
				class="text-sm font-medium underline underline-offset-2"
				onclick={() => (useSession = !useSession)}
			>
				{useSession
					? 'Back to the Apps Script setup'
					: 'No Apps Script on your school account? Use a Classroom session instead'}
			</button>
			{#if useSession}
				<SessionForm
					bind:cookie
					testing={sessionPending}
					error={sessionError?.message}
					onConnect={connectSession}
				/>
			{/if}
		</div>
	{/if}
</div>
