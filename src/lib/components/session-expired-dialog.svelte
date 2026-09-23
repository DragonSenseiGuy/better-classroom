<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import LoaderIcon from '@lucide/svelte/icons/loader-circle';

	let {
		expired
	}: { expired: { savedAt: number; detail?: string } | null } = $props();

	// Dismiss once per expired savedAt: reopen on every app load while the
	// same dead cookie is saved, stay closed after a fresh save reloads.
	let dismissedFor = $state<number | null>(null);
	let open = $derived(!!expired && dismissedFor !== expired.savedAt);

	let cookie = $state('');
	let pending = $state(false);
	let error = $state<string | null>(null);

	function handleOpenChange(next: boolean) {
		if (!next && expired) dismissedFor = expired.savedAt;
	}

	type SessionResponse =
		| { ok: true; email?: string; savedAt?: number }
		| { ok: false; code?: string; message?: string };

	async function reconnect() {
		if (!cookie.trim() || pending) return;
		pending = true;
		error = null;
		try {
			const res = await fetch('/api/session', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ cookie })
			});
			const body = (await res.json()) as SessionResponse;
			if (body.ok) {
				// New savedAt clears the expired RichStatus server-side;
				// reload snapshot so the dialog never reopens for it.
				window.location.reload();
			} else {
				error = body.message ?? 'That cookie did not work.';
			}
		} catch (err) {
			error = String(err);
		} finally {
			pending = false;
		}
	}
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Classroom session expired</Dialog.Title>
			<Dialog.Description>
				{#if expired?.detail}
					{expired.detail}
				{:else}
					Your saved Classroom cookie no longer works. Paste a fresh one to resume sync.
				{/if}
			</Dialog.Description>
		</Dialog.Header>
		<div class="grid gap-3">
			<ol class="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
				<li>Open classroom.google.com/u/0/h/st signed in with your school account.</li>
				<li>Open DevTools → Network, reload, click the first classroom.google.com request.</li>
				<li>Under Request Headers copy the whole <code>Cookie</code> value.</li>
			</ol>
			<textarea
				bind:value={cookie}
				rows="4"
				spellcheck="false"
				placeholder="SID=…; HSID=…; SSID=…; APISID=…; SAPISID=…; …"
				class="w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
			></textarea>
			{#if error}
				<p class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
			{/if}
		</div>
		<Dialog.Footer>
			<Button
				type="button"
				variant="outline"
				onclick={() => expired && (dismissedFor = expired.savedAt)}
			>
				Browse offline
			</Button>
			<Button type="button" onclick={reconnect} disabled={pending || !cookie.trim()}>
				{#if pending}<LoaderIcon data-icon="inline-start" class="animate-spin" />Reconnecting{:else}Reconnect{/if}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
