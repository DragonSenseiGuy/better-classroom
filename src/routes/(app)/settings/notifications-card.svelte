<script lang="ts">
	import { browser } from '$app/env';
	import {
		initNotifications,
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

	$effect(() => {
		if (!notifications.ready) void initNotifications();
	});

	const REASONS: Record<string, { title: string; description: string }> = {
		denied: {
			title: 'Notifications blocked',
			description: 'Allow notifications for this site in your browser settings, then try again.'
		},
		unconfigured: {
			title: 'Push is not set up on the server',
			description: 'The server has no VAPID keys, so it cannot send notifications yet.'
		},
		unsupported: {
			title: 'Not supported here',
			description: 'This browser cannot show notifications at all.'
		},
		failed: {
			title: 'Could not subscribe',
			description: 'The browser refused the push subscription. Try again in a moment.'
		}
	};

	let busy = $state(false);

	async function toggleNotifications() {
		busy = true;
		const wantOn = !notifications.enabled;
		const result = await setNotificationsEnabled(wantOn);
		busy = false;
		if (!result.ok) {
			const reason = REASONS[result.reason]!;
			notify('rose', reason.title, { description: reason.description, duration: 8000 });
		} else if (wantOn) {
			notify('emerald', 'Notifications on', {
				description:
					result.mode === 'push'
						? 'New assignments and posts will reach you even with this tab closed.'
						: 'This browser has no push service, so notifications only appear while the app is open in a tab.',
				duration: result.mode === 'push' ? 5000 : 9000
			});
		}
	}

	let testing = $state(false);

	async function testNotification() {
		testing = true;
		const sent = await sendTestNotification();
		testing = false;
		if (sent)
			notify('emerald', 'Test sent', {
				description:
					notifications.mode === 'push'
						? 'It travels through your browser’s push service, so give it a second. If nothing appears, check that your browser may notify you in your system settings and that Do Not Disturb is off.'
						: 'If nothing appeared, check that your browser may notify you in your system settings and that Do Not Disturb is off.',
				duration: 9000
			});
		else
			notify('rose', 'Could not send the test', {
				description:
					'The server could not push to this browser. Try turning notifications off and on again.',
				duration: 8000
			});
	}
</script>

<SettingsCard class="max-w-lg">
	<div class="flex items-start justify-between gap-4 px-5 py-4">
		<div>
			<h2 class="text-base font-semibold tracking-tight">Browser notifications</h2>
			<p class="mt-1 text-sm text-pretty text-muted-foreground">
				Get a notification when a new assignment or post lands during a sync.
				{#if notifications.enabled && notifications.mode === 'in-page'}
					This browser has no push service, so these only appear while the app is open in a tab.
				{:else}
					They are sent from the server, so they arrive whether or not this app is open — as long as
					your browser is running.
				{/if}
			</p>
		</div>
		{#if !browser || !notifications.ready}
			<Badge variant="outline" class="invisible">Off</Badge>
		{:else if !notificationsSupported()}
			<Badge variant="outline">Unsupported</Badge>
		{:else}
			<Button
				variant={notifications.enabled ? 'default' : 'outline'}
				size="sm"
				disabled={busy}
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
