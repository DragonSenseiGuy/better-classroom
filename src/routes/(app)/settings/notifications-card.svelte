<script lang="ts">
	import { browser } from '$app/env';
	import {
		notifications,
		notificationsSupported,
		sendTestNotification,
		setNotificationsEnabled
	} from '#lib/notifications.svelte.ts';
	import { notify } from '#lib/toast.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import BellIcon from '@lucide/svelte/icons/bell';
	import BellOffIcon from '@lucide/svelte/icons/bell-off';
	import SettingsCard from './settings-card.svelte';

	async function toggleNotifications() {
		await setNotificationsEnabled(!notifications.enabled);
		if (notifications.enabled) {
			notify('emerald', 'Notifications on', {
				description: 'You’ll hear about new assignments and posts as they sync.'
			});
		} else if (notifications.permission === 'denied') {
			notify('rose', 'Notifications blocked', {
				description: 'Allow notifications for this site in your browser settings, then try again.',
				duration: 8000
			});
		}
	}
	let testing = $state(false);
	async function testNotification() {
		testing = true;
		const shown = await sendTestNotification();
		testing = false;
		if (shown) {
			notify('emerald', 'Test sent', {
				description:
					'If nothing appeared, check that Chrome is allowed to notify you in your system settings and that Do Not Disturb is off.',
				duration: 8000
			});
		} else {
			notify('rose', 'Could not send the test', {
				description:
					notifications.permission === 'granted'
						? 'Your browser refused to show the notification.'
						: 'Your browser has not granted notification permission for this site. Turn notifications off and on again to ask.',
				duration: 8000
			});
		}
	}
</script>

<SettingsCard class="max-w-lg">
	<div class="flex items-start justify-between gap-4 px-5 py-4">
		<div>
			<h2 class="text-base font-semibold tracking-tight">Browser notifications</h2>
			<p class="mt-1 text-sm text-pretty text-muted-foreground">
				Get a notification when a new assignment or post lands during a sync. Only fires while this
				app is open in a tab.
			</p>
		</div>
		{#if !browser}
			<Badge variant="outline" class="invisible">Off</Badge>
		{:else if !notificationsSupported()}
			<Badge variant="outline">Unsupported</Badge>
		{:else}
			<Button
				variant={notifications.enabled ? 'default' : 'outline'}
				size="sm"
				onclick={toggleNotifications}
			>
				{#if notifications.enabled}<BellIcon data-icon="inline-start" />On{:else}<BellOffIcon
						data-icon="inline-start"
					/>Off{/if}
			</Button>
		{/if}
	</div>
	{#if notifications.permission === 'denied'}
		<p class="mx-5 mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
			Your browser has blocked notifications for this site. Allow them in the site settings to turn
			this on.
		</p>
	{:else if notifications.enabled}
		<div class="border-t px-5 py-3">
			<Button variant="outline" size="sm" disabled={testing} onclick={testNotification}>
				Send a test
			</Button>
		</div>
	{/if}
</SettingsCard>
