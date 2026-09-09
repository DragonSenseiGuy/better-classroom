<script lang="ts">
	import { live } from '#lib/db/live.svelte.ts';
	import { useLiveQuery, eq } from '@tanstack/svelte-db';
	import { courses } from '#lib/db/collections.ts';
	import { setCoursePrefs } from '#lib/course-prefs.ts';
	import { notify } from '#lib/toast.ts';
	import { courseColor, displayName } from '#lib/format.ts';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import PageHeader from '#lib/components/page-header.svelte';
	import { formatDateTime, formatRelative } from '#lib/format.ts';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import CheckIcon from '@lucide/svelte/icons/check';

	let { data } = $props();
	const status = $derived(live.sync);
	const hiddenQuery = useLiveQuery({
		query: (q) => q.from({ c: courses }).where(({ c }) => eq(c.hidden, true))
	});
	async function show(course: { id: string; name: string; nickname?: string }) {
		await setCoursePrefs(course.id, { hidden: false });
		notify('emerald', `${displayName(course)} is back`, {
			action: { label: 'Undo', onClick: () => setCoursePrefs(course.id, { hidden: true }) }
		});
	}
	const hidden = $derived(
		hiddenQuery.data.slice().sort((a, b) => displayName(a).localeCompare(displayName(b)))
	);
	let busy = $state(false);
	let copied = $state<string | null>(null);

	async function syncNow() {
		busy = true;
		try {
			await fetch('/api/sync', { method: 'POST' });
			notify('pink', 'Sync started', { description: 'Pulling the latest from Classroom.' });
		} finally {
			busy = false;
		}
	}

	async function copy(key: string, text: string) {
		await navigator.clipboard.writeText(text);
		copied = key;
		setTimeout(() => (copied = null), 1500);
	}

	const steps = [
		'Open script.google.com with your school account and create a new project.',
		'Open Project settings (the gear) and tick “Show appsscript.json manifest file in editor”.',
		'Replace the contents of appsscript.json with the manifest below, and Code.gs with the script below.',
		'Run the setSecret function once. Approve the permissions, then copy the key from the execution log.',
		'Deploy → New deployment → Web app. Execute as “Me”, access “Anyone”. Copy the web app URL.',
		'Put both values in .env next to package.json, restart the server, then press Sync now.'
	];
	const envCommands =
		'APPS_SCRIPT_URL="https://script.google.com/macros/s/…/exec"\nAPPS_SCRIPT_KEY="paste-the-key-here"\nSYNC_INTERVAL_MINUTES=5';
</script>

<PageHeader
	title="Settings"
	description="Classroom data is pulled through an Apps Script running as you, cached in SQLite, and pushed to open tabs instantly."
>
	{#snippet actions()}
		<Button onclick={syncNow} disabled={busy || status?.status === 'running'}>
			<RefreshCwIcon
				data-icon="inline-start"
				class={busy || status?.status === 'running' ? 'animate-spin' : ''}
			/>
			Sync now
		</Button>
	{/snippet}
</PageHeader>

<section class="mt-8">
	<h2 class="text-base font-semibold tracking-tight">Sync status</h2>
	<dl class="mt-3 grid grid-cols-2 gap-y-4 text-sm sm:grid-cols-4">
		<div class="pr-4">
			<dt class="text-muted-foreground">State</dt>
			<dd class="mt-1">
				{#if status?.status === 'running'}<Badge variant="secondary"
						>Running · {status.pending} left</Badge
					>
				{:else if status?.status === 'error'}<Badge variant="destructive">Error</Badge>
				{:else if status?.configured}<Badge
						variant="outline"
						class="text-emerald-700 dark:text-emerald-400">Healthy</Badge
					>
				{:else}<Badge variant="outline">Not configured</Badge>{/if}
			</dd>
		</div>
		<div class="border-l border-border/60 pl-4">
			<dt class="text-muted-foreground">Last finished</dt>
			<dd class="mt-1 font-medium tabular-nums">
				{status?.finishedAt ? formatRelative(status.finishedAt) : '–'}
			</dd>
			{#if status?.finishedAt}<dd class="text-xs text-muted-foreground tabular-nums">
					{formatDateTime(status.finishedAt)}
				</dd>{/if}
		</div>
		<div class="pr-4 sm:border-l sm:border-border/60 sm:pl-4">
			<dt class="text-muted-foreground">Courses</dt>
			<dd class="mt-1 font-medium tabular-nums">{status?.courseCount ?? 0}</dd>
		</div>
		<div class="border-l border-border/60 pl-4">
			<dt class="text-muted-foreground">Schedule</dt>
			<dd class="mt-1 font-medium">Every {status?.intervalMinutes ?? 5} minutes</dd>
		</div>
	</dl>
	{#if status?.error}
		<p class="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
			{status.error}
		</p>
	{/if}
</section>

<section class="mt-10">
	<h2 class="text-base font-semibold tracking-tight">Set up the Apps Script</h2>
	<p class="mt-1 max-w-[65ch] text-sm text-pretty text-muted-foreground">
		Schools usually block third-party OAuth apps but allow Apps Script, since it runs under your own
		account and only uses Google’s official Classroom API.
	</p>
	<ol class="mt-4 list-decimal space-y-2 pl-5 text-sm marker:text-muted-foreground">
		{#each steps as step, i (i)}<li class="pl-1">{step}</li>{/each}
	</ol>

	<Tabs.Root value="code" class="mt-6">
		<Tabs.List variant="line">
			<Tabs.Trigger value="code">Code.gs</Tabs.Trigger>
			<Tabs.Trigger value="manifest">appsscript.json</Tabs.Trigger>
			<Tabs.Trigger value="env">.env</Tabs.Trigger>
		</Tabs.List>
		{#each [['code', data.appsScriptSource], ['manifest', data.manifestSource], ['env', envCommands]] as [key, source] (key)}
			<Tabs.Content value={key} class="relative mt-3">
				<Button
					variant="outline"
					size="icon-sm"
					class="absolute top-2 right-2"
					aria-label="Copy"
					onclick={() => copy(key, source)}
				>
					{#if copied === key}<CheckIcon />{:else}<CopyIcon />{/if}
				</Button>
				<pre
					class="max-h-[28rem] overflow-auto rounded-lg bg-muted p-4 text-xs leading-5 whitespace-pre"><code
						>{source}</code
					></pre>
			</Tabs.Content>
		{/each}
	</Tabs.Root>
</section>

<section class="mt-10">
	<h2 class="text-base font-semibold tracking-tight">Hidden courses</h2>
	<p class="mt-1 max-w-[65ch] text-sm text-pretty text-muted-foreground">
		Right-click a course in the sidebar to rename or hide it. Hidden courses stay synced but leave
		the sidebar, To-do, dashboard and search.
	</p>
	{#if hidden.length}
		<ul role="list" class="mt-3 max-w-md divide-y divide-border/60">
			{#each hidden as course (course.id)}
				<li class="flex items-center gap-3 py-2">
					<span class={`size-2 shrink-0 rounded-full ${courseColor(course.id)}`}></span>
					<span class="min-w-0 flex-1 truncate text-sm"
						>{displayName(course)}{#if course.nickname}<span class="text-muted-foreground">
								· {course.name}</span
							>{/if}</span
					>
					<Button variant="outline" size="sm" onclick={() => show(course)}
						><EyeIcon data-icon="inline-start" />Show</Button
					>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="mt-3 text-sm text-muted-foreground">No hidden courses.</p>
	{/if}
</section>

<section class="mt-10">
	<h2 class="text-base font-semibold tracking-tight">Keyboard shortcuts</h2>
	<dl class="mt-3 grid max-w-md grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
		<dt><kbd class="rounded border bg-muted px-1.5 py-0.5 font-sans text-xs">⌘ K</kbd></dt>
		<dd class="text-muted-foreground">Search and jump anywhere</dd>
		<dt><kbd class="rounded border bg-muted px-1.5 py-0.5 font-sans text-xs">G H</kbd></dt>
		<dd class="text-muted-foreground">Go home</dd>
		<dt><kbd class="rounded border bg-muted px-1.5 py-0.5 font-sans text-xs">G I</kbd></dt>
		<dd class="text-muted-foreground">Go to Inbox</dd>
		<dt><kbd class="rounded border bg-muted px-1.5 py-0.5 font-sans text-xs">G T</kbd></dt>
		<dd class="text-muted-foreground">Go to To-do</dd>
		<dt><kbd class="rounded border bg-muted px-1.5 py-0.5 font-sans text-xs">G S</kbd></dt>
		<dd class="text-muted-foreground">Go to Settings</dd>
	</dl>
</section>
