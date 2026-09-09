<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { createHotkey, createHotkeySequence } from '@tanstack/svelte-hotkeys';
	import { DbProvider, useLiveQuery, eq } from '@tanstack/svelte-db';
	import { displayName } from '#lib/format.ts';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import * as Breadcrumb from '#lib/components/ui/breadcrumb/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Kbd, KbdGroup } from '#lib/components/ui/kbd/index.js';
	import AppSidebar from '#lib/components/app-sidebar.svelte';
	import CommandMenu from '#lib/components/command-menu.svelte';
	import { createDb } from '#lib/db/client.ts';
	import { courses as coursesCollection } from '#lib/db/collections.ts';
	import {
		allDismissals,
		inboxAnnouncements,
		inboxKey,
		inboxMaterials,
		inboxWork
	} from '#lib/inbox.ts';
	import { live, primeLive } from '#lib/db/live.svelte.ts';
	import { Toaster } from '#lib/components/ui/sonner/index.js';
	import { notify } from '#lib/toast.ts';
	import SearchIcon from '@lucide/svelte/icons/search';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';

	let { children, data } = $props();
	const initial = untrack(() => data.snapshot);
	const client = createDb(initial);
	primeLive(initial.sync);

	let paletteOpen = $state(false);
	createHotkey('Mod+K', () => (paletteOpen = !paletteOpen), { preventDefault: true });
	createHotkeySequence(['G', 'H'], () => goto('/'));
	createHotkeySequence(['G', 'I'], () => goto('/inbox'));
	createHotkeySequence(['G', 'T'], () => goto('/todo'));
	createHotkeySequence(['G', 'S'], () => goto('/settings'));

	const coursesQuery = useLiveQuery({
		client,
		query: (q) => q.from({ c: coursesCollection }).where(({ c }) => eq(c.hidden, false))
	});
	const courses = $derived(
		coursesQuery.data.slice().sort((a, b) => displayName(a).localeCompare(displayName(b)))
	);

	const inboxAnnouncementsQuery = useLiveQuery({ client, query: inboxAnnouncements });
	const inboxWorkQuery = useLiveQuery({ client, query: inboxWork });
	const inboxMaterialsQuery = useLiveQuery({ client, query: inboxMaterials });
	const dismissalsQuery = useLiveQuery({ client, query: allDismissals });
	const inboxCount = $derived.by(() => {
		const done = new Set(dismissalsQuery.data.map((d) => d.id));
		let n = 0;
		for (const r of inboxAnnouncementsQuery.data)
			if (!done.has(inboxKey('announcement', r.a.id))) n++;
		for (const r of inboxWorkQuery.data) if (!done.has(inboxKey('work', r.w.id))) n++;
		for (const r of inboxMaterialsQuery.data) if (!done.has(inboxKey('material', r.m.id))) n++;
		return n;
	});

	const crumbs = $derived((page.data.crumbs ?? []) as { label: string; href?: string }[]);
	const syncing = $derived(live.sync?.status === 'running');
	let lastStatus = live.sync?.status;
	$effect(() => {
		const sync = live.sync;
		if (!sync) return;
		const prev = lastStatus;
		lastStatus = sync.status;
		if (prev !== 'running' || sync.status === 'running') return;
		if (sync.status === 'idle')
			notify('violet', 'Classroom synced', {
				description: `${sync.courseCount} courses up to date.`
			});
		else notify('rose', 'Sync failed', { description: sync.error?.split('\n')[0], duration: 8000 });
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>{page.data.title ? `${page.data.title} · Classroom` : 'Classroom'}</title>
</svelte:head>

<DbProvider {client}>
	<Sidebar.Provider>
		<AppSidebar
			{courses}
			{inboxCount}
			profile={data.snapshot.profile}
			onSearch={() => (paletteOpen = true)}
		/>
		<Sidebar.Inset class="isolate">
			<header
				class="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80"
			>
				<Sidebar.Trigger class="-ml-1" />
				{#if crumbs.length}
					<Breadcrumb.Root class="max-sm:hidden">
						<Breadcrumb.List>
							{#each crumbs as crumb, i (i)}
								{#if i > 0}<Breadcrumb.Separator />{/if}
								<Breadcrumb.Item>
									{#if crumb.href && i < crumbs.length - 1}
										<Breadcrumb.Link href={crumb.href}>{crumb.label}</Breadcrumb.Link>
									{:else}
										<Breadcrumb.Page>{crumb.label}</Breadcrumb.Page>
									{/if}
								</Breadcrumb.Item>
							{/each}
						</Breadcrumb.List>
					</Breadcrumb.Root>
				{/if}
				<div class="ml-auto flex items-center gap-2">
					{#if syncing}
						<span class="flex items-center gap-1.5 text-xs text-muted-foreground"
							><RefreshCwIcon class="size-3.5 animate-spin" />Syncing</span
						>
					{/if}
					<Button
						variant="outline"
						size="sm"
						class="text-muted-foreground"
						onclick={() => (paletteOpen = true)}
					>
						<SearchIcon data-icon="inline-start" />
						<span class="max-sm:hidden">Search</span>
						<KbdGroup class="max-sm:hidden"><Kbd>⌘</Kbd><Kbd>K</Kbd></KbdGroup>
					</Button>
				</div>
			</header>
			<main class="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
				{@render children()}
			</main>
		</Sidebar.Inset>
	</Sidebar.Provider>

	<CommandMenu bind:open={paletteOpen} {courses} />
</DbProvider>

<Toaster position="bottom-right" closeButton />
