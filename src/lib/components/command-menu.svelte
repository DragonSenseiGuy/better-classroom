<script lang="ts">
	import * as Command from '#lib/components/ui/command/index.js';
	import { goto, preloadData } from '$app/navigation';
	import type { SearchHit } from '#lib/shared/types.ts';
	import type { SearchDoc } from '#lib/shared/types.ts';
	import { courseColor, displayName, formatDue } from '#lib/format.ts';
	import HouseIcon from '@lucide/svelte/icons/house';
	import ListChecksIcon from '@lucide/svelte/icons/list-checks';
	import InboxIcon from '@lucide/svelte/icons/inbox';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import SearchIcon from '@lucide/svelte/icons/search';
	import ClipboardListIcon from '@lucide/svelte/icons/clipboard-list';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import MegaphoneIcon from '@lucide/svelte/icons/megaphone';

	type Course = { id: string; name: string; nickname?: string };
	let { open = $bindable(false), courses }: { open?: boolean; courses: Course[] } = $props();

	let query = $state('');
	const trimmed = $derived(query.trim());
	let hits = $state<SearchHit<SearchDoc>[]>([]);
	let loading = $state(false);
	let controller: AbortController | undefined;
	$effect(() => {
		const q = open ? trimmed : '';
		controller?.abort();
		if (!q) {
			hits = [];
			return;
		}
		const c = (controller = new AbortController());
		loading = true;
		fetch(`/api/search?q=${encodeURIComponent(q)}&limit=12`, { signal: c.signal })
			.then((r) => r.json())
			.then((res: SearchHit<SearchDoc>[]) => {
				if (!c.signal.aborted) hits = res;
			})
			.catch(() => {})
			.finally(() => {
				if (!c.signal.aborted) loading = false;
			});
	});
	const pages = [
		{ href: '/', label: 'Home', icon: HouseIcon },
		{ href: '/inbox', label: 'Inbox', icon: InboxIcon },
		{ href: '/todo', label: 'To-do', icon: ListChecksIcon },
		{ href: '/settings', label: 'Settings', icon: SettingsIcon }
	];
	const matches = (label: string) => {
		const q = trimmed.toLowerCase();
		const l = label.toLowerCase();
		return l.includes(q) || q.split(/\s+/).every((t) => l.includes(t));
	};
	const courseHits = $derived(
		trimmed
			? courses
					.filter((c) => matches(displayName(c)))
					.sort(
						(a, b) =>
							displayName(a).toLowerCase().indexOf(trimmed.toLowerCase()) -
								displayName(b).toLowerCase().indexOf(trimmed.toLowerCase()) ||
							displayName(a).length - displayName(b).length
					)
					.slice(0, 5)
			: courses
	);
	const pageHits = $derived(trimmed ? pages.filter((p) => matches(p.label)) : pages);
	const results = $derived(
		hits.filter((h) => h.doc.kind !== 'course' || !courseHits.some((c) => c.id === h.doc.id))
	);

	const kindIcon = {
		work: ClipboardListIcon,
		material: BookOpenIcon,
		announcement: MegaphoneIcon,
		course: BookOpenIcon
	} as const;

	function go(href: string) {
		open = false;
		goto(href);
	}

	$effect(() => {
		if (!open) query = '';
	});
</script>

<Command.Dialog
	bind:open
	shouldFilter={false}
	onValueChange={(v) => v.startsWith('/') && preloadData(v)}
	title="Search"
	description="Search classwork, materials and announcements"
	class="top-[12vh] rounded-xl sm:max-w-2xl"
>
	<Command.Input bind:value={query} placeholder="Search classwork, announcements, courses…" />
	<Command.List class="max-h-[60dvh]">
		<Command.Empty>{loading ? 'Searching…' : 'No results.'}</Command.Empty>
		{#if pageHits.length}
			<Command.Group heading="Pages">
				{#each pageHits as p (p.href)}
					<Command.Item value={p.href} onSelect={() => go(p.href)}>
						<p.icon class="text-muted-foreground" />
						<span>{p.label}</span>
					</Command.Item>
				{/each}
			</Command.Group>
		{/if}
		{#if courseHits.length}
			<Command.Group heading="Courses">
				{#each courseHits as course (course.id)}
					<Command.Item
						value={`/courses/${course.id}`}
						onSelect={() => go(`/courses/${course.id}`)}
					>
						<span class={`ml-1 size-2 rounded-full ${courseColor(course.id)}`}></span>
						<span class="ml-1">{displayName(course)}</span>
					</Command.Item>
				{/each}
			</Command.Group>
		{/if}
		{#if results.length}
			<Command.Group heading="Results">
				{#each results as hit (hit.doc.kind + hit.doc.id)}
					{@const Icon = kindIcon[hit.doc.kind]}
					<Command.Item value={hit.doc.href} onSelect={() => go(hit.doc.href)}>
						<Icon class="text-muted-foreground" />
						<div class="grid min-w-0 flex-1">
							<span class="truncate">{hit.doc.title}</span>
							<span class="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
								<span class={`size-1.5 shrink-0 rounded-full ${courseColor(hit.doc.courseId)}`}
								></span>
								{hit.doc.courseName}
								{#if hit.doc.dueAt}<span aria-hidden="true">·</span><span class="tabular-nums"
										>{formatDue(hit.doc.dueAt, true)}</span
									>{/if}
							</span>
						</div>
					</Command.Item>
				{/each}
			</Command.Group>
		{/if}
		{#if trimmed}
			<Command.Item
				value={`/search?q=${encodeURIComponent(trimmed)}`}
				onSelect={() => go(`/search?q=${encodeURIComponent(trimmed)}`)}
			>
				<SearchIcon class="text-muted-foreground" />
				<span>See all results for “{trimmed}”</span>
			</Command.Item>
		{/if}
	</Command.List>
</Command.Dialog>
