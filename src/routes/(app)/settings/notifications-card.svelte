<script lang="ts">
	import { browser } from '$app/env';
	import favicon from '#lib/assets/favicon.png';
	import {
		notifications,
		notificationsSupported,
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
	function testNotification() {
		new Notification('Classroom', { body: 'Notifications are working.', icon: favicon });
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
			<Button variant="outline" size="sm" onclick={testNotification}>Send a test</Button>
		</div>
	{/if}
</SettingsCard>
