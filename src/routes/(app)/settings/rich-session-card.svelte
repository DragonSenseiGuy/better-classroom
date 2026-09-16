<script lang="ts">
	import type { PageData } from './$types';
	import { notify } from '#lib/toast.ts';
	import { formatRelative } from '#lib/format.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import PlugZapIcon from '@lucide/svelte/icons/plug-zap';
	import LoaderIcon from '@lucide/svelte/icons/loader-circle';
	import SettingsCard from './settings-card.svelte';

	let { initial }: { initial: PageData['rich'] } = $props();

	// svelte-ignore state_referenced_locally
	let rich = $state(initial);
	let cookieDraft = $state('');
	let savingCookie = $state(false);
	// svelte-ignore state_referenced_locally
	let cookieOpen = $state(!initial.configured);

	async function saveCookie() {
		if (!cookieDraft.trim()) return;
		savingCookie = true;
		try {
			const res = await fetch('/api/rich', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ cookie: cookieDraft })
			});
			const result = (await res.json()) as
				| {
						ok: true;
						authuser: number;
						sample: number;
						savedAt: number;
						status: typeof rich.status;
						keepAlive: typeof rich.keepAlive;
				  }
				| { ok: false; message: string };
			if (result.ok) {
				rich = {
					configured: true,
					savedAt: result.savedAt,
					authuser: result.authuser,
					status: result.status,
					keepAlive: result.keepAlive
				};
				cookieDraft = '';
				cookieOpen = false;
				notify('emerald', 'Classroom session saved', {
					description: `Signed in as account ${result.authuser}. Fetching formatting for every post now.`
				});
			} else
				notify('rose', 'That cookie did not work', {
					description: result.message,
					duration: 12000
				});
		} finally {
			savingCookie = false;
		}
	}
	async function forgetCookie() {
		const res = await fetch('/api/rich', { method: 'DELETE' });
		rich = (await res.json()) as typeof rich;
		cookieOpen = true;
		notify('amber', 'Classroom session removed', {
			description: 'Posts keep the formatting already fetched; new ones stay plain.'
		});
	}
	async function refreshRich() {
		const res = await fetch('/api/rich');
		rich = (await res.json()) as typeof rich;
	}
	const keptAliveAt = $derived(
		Math.max(rich.keepAlive?.rotatedAt ?? 0, rich.keepAlive?.refreshedAt ?? 0) || undefined
	);
</script>

<SettingsCard class="mt-6">
	<div class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
		<div class="flex items-center gap-3">
			<h2 class="text-base font-semibold tracking-tight">Post formatting</h2>
			{#if !rich.configured}<Badge variant="outline">Off</Badge>
			{:else if rich.status && !rich.status.ok}<Badge variant="destructive"
					>{rich.status.expired ? 'Session expired' : 'Error'}</Badge
				>
			{:else}<Badge variant="outline" class="text-emerald-700 dark:text-emerald-400">On</Badge>{/if}
		</div>
		{#if rich.configured}
			<div class="flex items-center gap-2">
				<Button variant="outline" size="sm" onclick={refreshRich}>
					<RefreshCwIcon data-icon="inline-start" />Refresh
				</Button>
				<Button variant="outline" size="sm" onclick={() => (cookieOpen = !cookieOpen)}>
					{cookieOpen ? 'Cancel' : 'Replace cookie'}
				</Button>
				<Button variant="destructive" size="sm" onclick={forgetCookie}>Forget</Button>
			</div>
		{/if}
	</div>
	<div class="space-y-3 px-5 py-4 text-sm">
		<p class="max-w-prose text-pretty text-muted-foreground">
			The Classroom API strips bold, underline and lists from posts. With a signed-in Classroom
			session the app can read the formatted version the web app uses. The cookie stays in the local
			database and is only ever sent to classroom.google.com.
		</p>
		{#if rich.configured}
			<dl class="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
				<div>
					<dt class="text-muted-foreground">Cookie saved</dt>
					<dd class="mt-1 font-medium tabular-nums">
						{rich.savedAt ? formatRelative(rich.savedAt) : '–'}
					</dd>
				</div>
				<div>
					<dt class="text-muted-foreground">Kept alive</dt>
					<dd class="mt-1 font-medium tabular-nums">
						{keptAliveAt ? formatRelative(keptAliveAt) : '–'}
					</dd>
				</div>
				<div>
					<dt class="text-muted-foreground">Account slot</dt>
					<dd class="mt-1 font-medium tabular-nums">/u/{rich.authuser ?? 0}/</dd>
				</div>
				<div>
					<dt class="text-muted-foreground">Last run</dt>
					<dd class="mt-1 font-medium tabular-nums">
						{rich.status ? formatRelative(rich.status.at) : '–'}
					</dd>
				</div>
				<div>
					<dt class="text-muted-foreground">Posts updated</dt>
					<dd class="mt-1 font-medium tabular-nums">{rich.status?.updated ?? 0}</dd>
				</div>
			</dl>
			{#if rich.status && !rich.status.ok}
				<p class="rounded-lg bg-destructive/10 px-3 py-2 text-destructive">
					{rich.status.message}
				</p>
			{/if}
		{/if}
		{#if cookieOpen}
			<ol class="max-w-prose list-decimal space-y-1 pl-5 text-muted-foreground">
				<li>
					Open classroom.google.com in a browser profile you use for nothing else, signed in with
					your school account. Google rotates the session cookie from any open Google tab, and two
					rotators on one session get the whole account signed out, so this profile must stay closed
					once the cookie is copied.
				</li>
				<li>
					Open DevTools → Network, reload, click the first <span class="font-mono"
						>classroom.google.com</span
					> request.
				</li>
				<li>
					Under Request Headers copy the whole <span class="font-mono">Cookie</span> value and paste it
					below.
				</li>
			</ol>
			<textarea
				bind:value={cookieDraft}
				rows="4"
				spellcheck="false"
				placeholder="SID=…; HSID=…; SSID=…; APISID=…; SAPISID=…; …"
				class="w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
			></textarea>
			<div class="flex items-center gap-2">
				<Button size="sm" onclick={saveCookie} disabled={savingCookie || !cookieDraft.trim()}>
					{#if savingCookie}<LoaderIcon
							data-icon="inline-start"
							class="animate-spin"
						/>{:else}<PlugZapIcon data-icon="inline-start" />{/if}Save and test
				</Button>
				<span class="text-xs text-muted-foreground"
					>The app keeps the session alive itself. Paste a fresh one when the badge says expired.</span
				>
			</div>
		{/if}
	</div>
</SettingsCard>
