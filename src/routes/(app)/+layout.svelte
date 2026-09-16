<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { createHotkey, createHotkeySequence } from '@tanstack/svelte-hotkeys';
	import { DbProvider, useLiveQuery } from '@tanstack/svelte-db';
	import { byDisplayName } from '#lib/course.ts';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import * as Breadcrumb from '#lib/components/ui/breadcrumb/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Kbd, KbdGroup } from '#lib/components/ui/kbd/index.js';
	import AppSidebar from '#lib/components/app-sidebar.svelte';
	import CommandMenu from '#lib/components/command-menu.svelte';
	import FirstSyncBanner from '#lib/components/first-sync-banner.svelte';
	import RenameCourseDialog from '#lib/components/rename-course-dialog.svelte';
	import { courseEditor } from '#lib/course-editor.svelte.ts';
	import { createDb } from '#lib/db/client.ts';
	import { courses as coursesCollection } from '#lib/db/collections.ts';
	import {
		allDismissals,
		inboxAnnouncements,
		inboxKey,
		inboxMaterials,
		workWithContext
	} from '#lib/db/queries.ts';
	import { live, primeLive } from '#lib/db/live.svelte.ts';
	import { syncColorOverrides } from '#lib/course-colors.svelte.ts';
	import { initNotifications, watchForNewItems } from '#lib/notifications.svelte.ts';
	import { titleBadge } from '#lib/title.svelte.ts';
	import { workStatus } from '#lib/shared/status.ts';
	import { isOpen } from '#lib/work.ts';
	import { notify } from '#lib/toast.ts';
	import SearchIcon from '@lucide/svelte/icons/search';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';

	let { children, data } = $props();
	const initial = untrack(() => data.snapshot);
	const client = createDb(initial);
	primeLive(initial.sync);
	syncColorOverrides(initial.courses);

	let paletteOpen = $state(false);
	createHotkey('Mod+K', () => (paletteOpen = !paletteOpen), { preventDefault: true });
	createHotkeySequence(['G', 'H'], () => goto('/'));
	createHotkeySequence(['G', 'I'], () => goto('/inbox'));
	createHotkeySequence(['G', 'T'], () => goto('/todo'));
	createHotkeySequence(['G', 'S'], () => goto('/settings'));

	const allCoursesQuery = useLiveQuery({
		client,
		query: (q) => q.from({ c: coursesCollection })
	});
	$effect(() => syncColorOverrides(allCoursesQuery.data));
	const courses = $derived(allCoursesQuery.data.filter((c) => !c.hidden).sort(byDisplayName));
	const courseById = $derived(new Map(allCoursesQuery.data.map((c) => [c.id, c])));
	$effect(() => void initNotifications());
	$effect(() => watchForNewItems((id) => courseById.get(id)));

	const inboxAnnouncementsQuery = useLiveQuery({ client, query: inboxAnnouncements });
	const inboxMaterialsQuery = useLiveQuery({ client, query: inboxMaterials });
	const dismissalsQuery = useLiveQuery({ client, query: allDismissals });
	const inboxCount = $derived.by(() => {
		const done = new Set(dismissalsQuery.data.map((d) => d.id));
		let n = 0;
		for (const r of inboxAnnouncementsQuery.data)
			if (!done.has(inboxKey('announcement', r.a.id))) n++;
		for (const r of inboxMaterialsQuery.data) if (!done.has(inboxKey('material', r.m.id))) n++;
		return n;
	});
	$effect(() => {
		titleBadge.count = inboxCount;
	});

	const workQuery = useLiveQuery({ client, query: workWithContext });
	const todoCount = $derived.by(() => {
		const now = Date.now();
		let n = 0;
		for (const r of workQuery.data) {
			if (isOpen({ status: workStatus(r.s ?? undefined, r.w.dueAt, now) })) n++;
		}
		return n;
	});

	const crumbs = $derived((page.data.crumbs ?? []) as { label: string; href?: string }[]);
	const mobileTitle = $derived((page.data.title as string | undefined) ?? crumbs.at(-1)?.label);
	const syncing = $derived(live.sync?.status === 'running');
	let lastStatus = live.sync?.status;
	$effect(() => {
		const sync = live.sync;
		if (!sync) return;
		const prev = lastStatus;
		lastStatus = sync.status;
		if (prev !== 'running' || sync.status !== 'error') return;
		notify('rose', 'Sync failed', { description: sync.error?.split('\n')[0], duration: 8000 });
	});
</script>

<DbProvider {client}>
	<Sidebar.Provider>
		<AppSidebar
			{courses}
			{inboxCount}
			{todoCount}
			profile={data.snapshot.profile ?? { name: data.user?.name, email: data.user?.email }}
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
				{#if mobileTitle}
					<span class="min-w-0 truncate text-sm font-medium sm:hidden">{mobileTitle}</span>
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
			<FirstSyncBanner />
			<main class="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
				{@render children()}
			</main>
		</Sidebar.Inset>
	</Sidebar.Provider>

	<CommandMenu bind:open={paletteOpen} {courses} />
	<RenameCourseDialog bind:course={courseEditor.course} />
</DbProvider>
