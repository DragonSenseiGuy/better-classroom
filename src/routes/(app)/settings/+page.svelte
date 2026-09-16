<script lang="ts">
	import { page } from '$app/state';
	import { browser } from '$app/env';
	import { goto } from '$app/navigation';
	import { live } from '#lib/db/live.svelte.ts';
	import { authClient } from '#lib/auth-client.ts';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import { useLiveQuery } from '@tanstack/svelte-db';
	import { courses } from '#lib/db/collections.ts';
	import { setCoursePrefs } from '#lib/api.ts';
	import {
		notifications,
		notificationsSupported,
		setNotificationsEnabled
	} from '#lib/notifications.svelte.ts';
	import { notify } from '#lib/toast.ts';
	import { theme, setMode, setTheme, previewTheme, endPreview } from '#lib/theme.svelte.ts';
	import { LIGHT_THEMES, DARK_THEMES } from '#lib/themes.ts';
	import ThemeCard from '#lib/components/theme-card.svelte';
	import * as ToggleGroup from '#lib/components/ui/toggle-group/index.js';
	import SunIcon from '@lucide/svelte/icons/sun';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import MonitorIcon from '@lucide/svelte/icons/monitor';
	import { formatDateTime, formatRelative } from '#lib/format.ts';
	import { byDisplayName, displayName } from '#lib/course.ts';
	import CourseDot from '#lib/components/course-dot.svelte';
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

	let previewTimer: ReturnType<typeof setTimeout> | undefined;
	function stickyPreview(id: Parameters<typeof previewTheme>[0]) {
		clearTimeout(previewTimer);
		previewTheme(id);
	}
	function leaveGroup() {
		clearTimeout(previewTimer);
		previewTimer = setTimeout(endPreview, 150);
	}
	function focusOutGroup(e: FocusEvent) {
		const group = e.currentTarget as HTMLElement;
		if (!group.contains(e.relatedTarget as Node | null)) leaveGroup();
	}

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
	const sorted = $derived(courseQuery.data.slice().sort(byDisplayName));
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

	// svelte-ignore state_referenced_locally
	let rich = $state(data.rich);
	let cookieDraft = $state('');
	let savingCookie = $state(false);
	// svelte-ignore state_referenced_locally
	let cookieOpen = $state(!data.rich.configured);
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

	let signingOut = $state(false);
	async function signOut() {
		signingOut = true;
		await authClient.signOut();
		window.location.assign('/login');
	}

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
		<section
			class="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-card px-5 py-4 ring-1 ring-foreground/10"
		>
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
		</section>
		<section class="mb-6 rounded-xl bg-card ring-1 ring-foreground/10">
			<div class="border-b px-5 py-4">
				<h2 class="text-base font-semibold tracking-tight">Sources</h2>
			</div>
			<ul role="list" class="divide-y text-sm">
				{#each data.providers as provider (provider.id)}
					<li class="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
						<span class="w-40 font-medium">{provider.label}</span>
						{#if provider.state === 'off'}<Badge variant="outline">Off</Badge>
						{:else if provider.state === 'expired'}<Badge variant="destructive">Expired</Badge>
						{:else if provider.state === 'error'}<Badge variant="destructive">Error</Badge>
						{:else if provider.active}<Badge
								variant="outline"
								class="text-emerald-700 dark:text-emerald-400"
								>{provider.role === 'records' ? 'Primary' : 'On'}</Badge
							>
						{:else}<Badge variant="secondary">Standby</Badge>{/if}
						<span class="min-w-0 flex-1 truncate text-muted-foreground" title={provider.detail}
							>{provider.detail}</span
						>
					</li>
				{/each}
			</ul>
		</section>
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

		<section class="mt-6 rounded-xl bg-card ring-1 ring-foreground/10">
			<div class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
				<div class="flex items-center gap-3">
					<h2 class="text-base font-semibold tracking-tight">Post formatting</h2>
					{#if !rich.configured}<Badge variant="outline">Off</Badge>
					{:else if rich.status && !rich.status.ok}<Badge variant="destructive"
							>{rich.status.expired ? 'Session expired' : 'Error'}</Badge
						>
					{:else}<Badge variant="outline" class="text-emerald-700 dark:text-emerald-400">On</Badge
						>{/if}
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
					session the app can read the formatted version the web app uses. The cookie stays in the
					local database and is only ever sent to classroom.google.com.
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
							Open classroom.google.com in a browser profile you use for nothing else, signed in
							with your school account. Google rotates the session cookie from any open Google tab,
							and two rotators on one session get the whole account signed out, so this profile must
							stay closed once the cookie is copied.
						</li>
						<li>
							Open DevTools → Network, reload, click the first <span class="font-mono"
								>classroom.google.com</span
							> request.
						</li>
						<li>
							Under Request Headers copy the whole <span class="font-mono">Cookie</span> value and paste
							it below.
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
							>The app keeps the session alive itself. Paste a fresh one when the badge says
							expired.</span
						>
					</div>
				{/if}
			</div>
		</section>
	</Tabs.Content>

	<Tabs.Content value="appearance" class="mt-6">
		<section class="max-w-3xl rounded-xl bg-card ring-1 ring-foreground/10">
			<div class="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
				<div>
					<h2 class="text-base font-semibold tracking-tight">Mode</h2>
					<p class="mt-1 text-sm text-muted-foreground">
						System switches between your light and dark themes with your OS.
					</p>
				</div>
				<ToggleGroup.Root
					type="single"
					variant="outline"
					value={theme.mode}
					onValueChange={(v) => v && setMode(v as typeof theme.mode)}
				>
					<ToggleGroup.Item value="system" aria-label="System"
						><MonitorIcon data-icon="inline-start" />System</ToggleGroup.Item
					>
					<ToggleGroup.Item value="light" aria-label="Light"
						><SunIcon data-icon="inline-start" />Light</ToggleGroup.Item
					>
					<ToggleGroup.Item value="dark" aria-label="Dark"
						><MoonIcon data-icon="inline-start" />Dark</ToggleGroup.Item
					>
				</ToggleGroup.Root>
			</div>
			{#each [['light', LIGHT_THEMES], ['dark', DARK_THEMES]] as const as [mode, list] (mode)}
				{@const active = theme.resolved === mode}
				<div
					class="border-t px-5 py-4 transition-opacity {active
						? ''
						: 'opacity-60 hover:opacity-100'}"
				>
					<div class="flex items-center gap-2">
						<h3 class="text-sm font-semibold tracking-tight">
							{mode === 'light' ? 'Light theme' : 'Dark theme'}
						</h3>
						{#if active}<Badge variant="secondary">Active</Badge>{/if}
					</div>
					<div
						role="radiogroup"
						aria-label="{mode} theme"
						class="mt-3 grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3"
						tabindex="-1"
						onmouseleave={leaveGroup}
						onfocusout={focusOutGroup}
					>
						{#each list as t (t.id)}
							<ThemeCard
								theme={t}
								selected={theme[mode] === t.id}
								onselect={() => setTheme(t.id)}
								onpreview={() => stickyPreview(t.id)}
							/>
						{/each}
					</div>
				</div>
			{/each}
			<p class="border-t px-5 py-3 text-xs text-muted-foreground">
				Hover a theme to try it on. Saved for this browser only.
			</p>
		</section>
	</Tabs.Content>

	<Tabs.Content value="courses" class="mt-6">
		<p class="max-w-[65ch] text-sm text-pretty text-muted-foreground">
			Nicknames and colors only change how courses look here. Hidden courses stay synced but leave
			the sidebar, To-do, Home and search.
		</p>
		<ul role="list" class="mt-4 max-w-lg divide-y divide-border/60">
			{#each visible as course (course.id)}
				<li class="flex items-center gap-3 py-2">
					<CourseDot id={course.id} size="lg" class="shrink-0" />
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
						<CourseDot id={course.id} size="lg" class="shrink-0" />
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
