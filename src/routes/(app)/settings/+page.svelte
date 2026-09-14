<script lang="ts">
	import { page } from '$app/state';
	import { browser } from '$app/env';
	import { goto } from '$app/navigation';
	import { live } from '#lib/db/live.svelte.ts';
	import { useLiveQuery } from '@tanstack/svelte-db';
	import { courses } from '#lib/db/collections.ts';
	import { setCoursePrefs } from '#lib/course-prefs.ts';
	import {
		notifications,
		notificationsSupported,
		setNotificationsEnabled
	} from '#lib/notifications.svelte.ts';
	import { notify } from '#lib/toast.ts';
	import { theme, setTheme } from '#lib/theme.svelte.ts';
	import { THEME_FAMILIES, type ThemeChoice } from '#lib/themes.ts';
	import ThemeSwatch from '#lib/components/theme-swatch.svelte';
	import { courseColor, displayName, formatDateTime, formatRelative } from '#lib/format.ts';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Kbd, KbdGroup } from '#lib/components/ui/kbd/index.js';
	import PageHeader from '#lib/components/page-header.svelte';
	import RenameCourseDialog from '#lib/components/rename-course-dialog.svelte';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import EyeOffIcon from '@lucide/svelte/icons/eye-off';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import PlugZapIcon from '@lucide/svelte/icons/plug-zap';
	import LoaderIcon from '@lucide/svelte/icons/loader-circle';
	import BellIcon from '@lucide/svelte/icons/bell';
	import BellOffIcon from '@lucide/svelte/icons/bell-off';

	let { data } = $props();
	const status = $derived(live.sync);
	const running = $derived(status?.status === 'running');

	const TABS = ['connection', 'appearance', 'courses', 'notifications', 'shortcuts'];
	let tab = $state(
		TABS.includes(page.url.searchParams.get('tab') ?? '')
			? page.url.searchParams.get('tab')!
			: 'connection'
	);
	function setTab(value: string) {
		tab = value;
		const url = new URL(page.url.href);
		if (value === 'connection') url.searchParams.delete('tab');
		else url.searchParams.set('tab', value);
		goto(url, { replace: true, shallow: true });
	}

	const courseQuery = useLiveQuery({ query: (q) => q.from({ c: courses }) });
	const sorted = $derived(
		courseQuery.data.slice().sort((a, b) => displayName(a).localeCompare(displayName(b)))
	);
	const visible = $derived(sorted.filter((c) => !c.hidden));
	const hidden = $derived(sorted.filter((c) => c.hidden));
	let editing = $state<(typeof sorted)[number] | null>(null);

	async function setHidden(
		course: { id: string; name: string; nickname?: string },
		value: boolean
	) {
		await setCoursePrefs(course.id, { hidden: value });
		notify(
			value ? 'amber' : 'emerald',
			value ? `Hid ${displayName(course)}` : `${displayName(course)} is back`,
			{
				action: { label: 'Undo', onClick: () => setCoursePrefs(course.id, { hidden: !value }) }
			}
		);
	}

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
		new Notification('Classroom', { body: 'Notifications are working.', icon: '/favicon.svg' });
	}

	const errors = $derived(status?.error ? status.error.split('\n').filter(Boolean) : []);
	const splitError = (line: string) => {
		const i = line.indexOf(': ');
		return i > 0 ? [line.slice(0, i), line.slice(i + 2)] : ['', line];
	};

	const shortcuts = [
		[['⌘', 'K'], 'Search and jump anywhere'],
		[['G', 'H'], 'Go home'],
		[['G', 'I'], 'Go to Inbox'],
		[['G', 'T'], 'Go to To-do'],
		[['G', 'S'], 'Go to Settings'],
		[['J'], 'Inbox: next item'],
		[['K'], 'Inbox: previous item'],
		[['E'], 'Inbox: mark done or undo'],
		[['↵'], 'Inbox: open item']
	] as const;

	const shortUrl = $derived(
		data.connection.url.replace('https://script.google.com/macros/s/', '…/').replace(/\/exec$/, '')
	);
</script>

<PageHeader title="Settings" />

<Tabs.Root value={tab} onValueChange={setTab} class="mt-6">
	<Tabs.List variant="line">
		<Tabs.Trigger value="connection">Connection</Tabs.Trigger>
		<Tabs.Trigger value="appearance">Appearance</Tabs.Trigger>
		<Tabs.Trigger value="courses">Courses</Tabs.Trigger>
		<Tabs.Trigger value="notifications">Notifications</Tabs.Trigger>
		<Tabs.Trigger value="shortcuts">Shortcuts</Tabs.Trigger>
	</Tabs.List>

	<Tabs.Content value="connection" class="mt-6">
		<section class="rounded-xl bg-card ring-1 ring-foreground/10">
			<div class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
				<div class="flex items-center gap-3">
					<h2 class="text-base font-semibold tracking-tight">Connection</h2>
					{#if running}<Badge variant="secondary">Syncing · {status?.pending} left</Badge>
					{:else if status?.status === 'error'}<Badge variant="destructive">Error</Badge>
					{:else}<Badge variant="outline" class="text-emerald-700 dark:text-emerald-400"
							>Healthy</Badge
						>{/if}
				</div>
				<div class="flex items-center gap-2">
					<Button variant="outline" size="sm" onclick={test} disabled={testing}>
						{#if testing}<LoaderIcon
								data-icon="inline-start"
								class="animate-spin"
							/>{:else}<PlugZapIcon data-icon="inline-start" />{/if}Test
					</Button>
					<Button size="sm" onclick={syncNow} disabled={syncing || running}>
						<RefreshCwIcon
							data-icon="inline-start"
							class={syncing || running ? 'animate-spin' : ''}
						/>
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
					<dd class="mt-1 font-mono text-xs">••••{data.connection.keyHint}</dd>
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
				<span class="truncate font-mono" title={data.connection.url}>{shortUrl}</span>
				<a href="/setup" class="font-medium text-foreground underline underline-offset-2"
					>Reconnect</a
				>
			</div>
		</section>
	</Tabs.Content>

	<Tabs.Content value="appearance" class="mt-6">
		<p class="max-w-[65ch] text-sm text-pretty text-muted-foreground">
			Pick a theme for this browser. System follows your OS light and dark setting.
		</p>
		<div
			role="radiogroup"
			aria-label="Theme"
			class="mt-4 grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3"
		>
			<ThemeSwatch
				id="system"
				name="System"
				family="Follows your OS"
				mode={theme.mode}
				selected={theme.choice === 'system'}
				onselect={() => setTheme('system')}
			/>
		</div>
		{#each THEME_FAMILIES as { family, themes } (family)}
			<h2 class="mt-8 text-sm font-semibold tracking-tight">{family}</h2>
			<div
				role="radiogroup"
				aria-label={family}
				class="mt-2 grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3"
			>
				{#each themes as t (t.id)}
					<ThemeSwatch
						id={t.id}
						name={t.name}
						family={t.mode === 'dark' ? 'Dark' : 'Light'}
						mode={t.mode}
						palette={t.palette}
						selected={theme.choice === t.id}
						onselect={() => setTheme(t.id as ThemeChoice)}
					/>
				{/each}
			</div>
		{/each}
	</Tabs.Content>

	<Tabs.Content value="courses" class="mt-6">
		<p class="max-w-[65ch] text-sm text-pretty text-muted-foreground">
			Nicknames and colors only change how courses look here. Hidden courses stay synced but leave
			the sidebar, To-do, Home and search.
		</p>
		<ul role="list" class="mt-4 max-w-lg divide-y divide-border/60">
			{#each visible as course (course.id)}
				<li class="flex items-center gap-3 py-2">
					<span class={`size-2.5 shrink-0 rounded-full ${courseColor(course.id)}`}></span>
					<span class="min-w-0 flex-1 truncate text-sm"
						>{displayName(course)}{#if course.nickname}<span class="text-muted-foreground">
								· {course.name}</span
							>{/if}</span
					>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Edit"
						onclick={() => (editing = course)}><PencilIcon /></Button
					>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label="Hide"
						onclick={() => setHidden(course, true)}><EyeOffIcon /></Button
					>
				</li>
			{:else}
				<li class="py-3 text-sm text-muted-foreground">No courses synced yet.</li>
			{/each}
		</ul>
		{#if hidden.length}
			<h2 class="mt-8 text-base font-semibold tracking-tight">Hidden</h2>
			<ul role="list" class="mt-2 max-w-lg divide-y divide-border/60">
				{#each hidden as course (course.id)}
					<li class="flex items-center gap-3 py-2 opacity-70">
						<span class={`size-2.5 shrink-0 rounded-full ${courseColor(course.id)}`}></span>
						<span class="min-w-0 flex-1 truncate text-sm">{displayName(course)}</span>
						<Button variant="outline" size="sm" onclick={() => setHidden(course, false)}
							><EyeIcon data-icon="inline-start" />Show</Button
						>
					</li>
				{/each}
			</ul>
		{/if}
	</Tabs.Content>

	<Tabs.Content value="notifications" class="mt-6">
		<section class="max-w-lg rounded-xl bg-card ring-1 ring-foreground/10">
			<div class="flex items-start justify-between gap-4 px-5 py-4">
				<div>
					<h2 class="text-base font-semibold tracking-tight">Browser notifications</h2>
					<p class="mt-1 text-sm text-pretty text-muted-foreground">
						Get a notification when a new assignment or post lands during a sync. Only fires while
						this app is open in a tab.
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
					Your browser has blocked notifications for this site. Allow them in the site settings to
					turn this on.
				</p>
			{:else if notifications.enabled}
				<div class="border-t px-5 py-3">
					<Button variant="outline" size="sm" onclick={testNotification}>Send a test</Button>
				</div>
			{/if}
		</section>
	</Tabs.Content>

	<Tabs.Content value="shortcuts" class="mt-6">
		<dl class="grid max-w-md grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
			{#each shortcuts as [keys, label] (label)}
				<dt>
					<KbdGroup
						>{#each keys as k (k)}<Kbd>{k}</Kbd>{/each}</KbdGroup
					>
				</dt>
				<dd class="text-muted-foreground">{label}</dd>
			{/each}
		</dl>
	</Tabs.Content>
</Tabs.Root>

<RenameCourseDialog bind:course={editing} />
