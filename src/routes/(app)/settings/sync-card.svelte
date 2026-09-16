<script lang="ts">
	import { live } from '#lib/db/live.svelte.ts';
	import { notify } from '#lib/toast.ts';
	import { formatDateTime, formatRelative } from '#lib/format.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import PlugZapIcon from '@lucide/svelte/icons/plug-zap';
	import LoaderIcon from '@lucide/svelte/icons/loader-circle';
	import SettingsCard from './settings-card.svelte';

	let { connection }: { connection: { url: string; keyHint: string } } = $props();

	const status = $derived(live.sync);
	const running = $derived(status?.status === 'running');

	let syncing = $state(false);
	async function syncNow() {
		syncing = true;
		try {
			await fetch('/api/sync', { method: 'POST' });
			notify('pink', 'Sync started', { description: 'Pulling the latest from Classroom.' });
		} finally {
			syncing = false;
		}
	}

	let testing = $state(false);
	async function test() {
		testing = true;
		try {
			const res = await fetch('/api/config', { method: 'POST' });
			const result = (await res.json()) as
				{ ok: true; name?: string; courseCount: number } | { ok: false; message: string };
			if (result.ok)
				notify('emerald', `Connected as ${result.name ?? 'you'}`, {
					description: `${result.courseCount} active courses visible.`
				});
			else notify('rose', 'Connection failed', { description: result.message, duration: 10000 });
		} finally {
			testing = false;
		}
	}

	const errors = $derived(status?.error ? status.error.split('\n').filter(Boolean) : []);
	const splitError = (line: string) => {
		const i = line.indexOf(': ');
		return i > 0 ? [line.slice(0, i), line.slice(i + 2)] : ['', line];
	};

	const shortUrl = $derived(
		connection.url.replace('https://script.google.com/macros/s/', '…/').replace(/\/exec$/, '')
	);
</script>

<SettingsCard>
	<div class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
		<div class="flex items-center gap-3">
			<h2 class="text-base font-semibold tracking-tight">Connection</h2>
			{#if running}<Badge variant="secondary">Syncing · {status?.pending} left</Badge>
			{:else if status?.status === 'error'}<Badge variant="destructive">Error</Badge>
			{:else}<Badge variant="outline" class="text-emerald-700 dark:text-emerald-400">Healthy</Badge
				>{/if}
		</div>
		<div class="flex items-center gap-2">
			<Button variant="outline" size="sm" onclick={test} disabled={testing}>
				{#if testing}<LoaderIcon data-icon="inline-start" class="animate-spin" />{:else}<PlugZapIcon
						data-icon="inline-start"
					/>{/if}Test
			</Button>
			<Button size="sm" onclick={syncNow} disabled={syncing || running}>
				<RefreshCwIcon data-icon="inline-start" class={syncing || running ? 'animate-spin' : ''} />
				Sync now
			</Button>
		</div>
	</div>
	<dl class="grid grid-cols-2 gap-x-4 gap-y-4 px-5 py-4 text-sm sm:grid-cols-4">
		<div>
			<dt class="text-muted-foreground">Last synced</dt>
			<dd class="mt-1 font-medium tabular-nums">
				{status?.finishedAt ? formatRelative(status.finishedAt) : '–'}
			</dd>
			{#if status?.finishedAt}<dd class="text-xs text-muted-foreground tabular-nums">
					{formatDateTime(status.finishedAt)}
				</dd>{/if}
		</div>
		<div>
			<dt class="text-muted-foreground">Courses</dt>
			<dd class="mt-1 font-medium tabular-nums">{status?.courseCount ?? 0}</dd>
		</div>
		<div>
			<dt class="text-muted-foreground">Schedule</dt>
			<dd class="mt-1 font-medium">Every {status?.intervalMinutes ?? 5} min</dd>
		</div>
		<div>
			<dt class="text-muted-foreground">Key</dt>
			<dd class="mt-1 font-mono text-xs">••••{connection.keyHint}</dd>
		</div>
	</dl>
	{#if errors.length}
		<ul
			role="list"
			class="mx-5 mb-4 divide-y divide-destructive/20 rounded-lg bg-destructive/10 text-sm text-destructive"
		>
			{#each errors as line, i (i)}
				{@const [where, what] = splitError(line)}
				<li class="px-3 py-2">
					{#if where}<span class="font-semibold">{where}</span> ·
					{/if}{what}
				</li>
			{/each}
		</ul>
	{/if}
	<div
		class="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3 text-xs text-muted-foreground"
	>
		<span class="truncate font-mono" title={connection.url}>{shortUrl}</span>
		<a href="/setup" class="font-medium text-foreground underline underline-offset-2">Reconnect</a>
	</div>
</SettingsCard>
