<script lang="ts">
	import { page } from '$app/state';
	import { authClient } from '#lib/auth-client.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import SettingsCard from './settings-card.svelte';

	let signingOut = $state(false);
	async function signOut() {
		signingOut = true;
		await authClient.signOut();
		window.location.assign('/login');
	}
</script>

<SettingsCard class="mb-6 flex flex-wrap items-center justify-between gap-3 px-5 py-4">
	<div class="min-w-0">
		<h2 class="text-base font-semibold tracking-tight">Account</h2>
		<p class="truncate text-sm text-muted-foreground">
			Signed in as {page.data.user?.name || page.data.user?.email}
			{#if page.data.user?.name}<span class="text-muted-foreground/70"
					>· {page.data.user.email}</span
				>{/if}
		</p>
	</div>
	<Button variant="outline" size="sm" onclick={signOut} disabled={signingOut}>
		<LogOutIcon data-icon="inline-start" />Sign out
	</Button>
</SettingsCard>
