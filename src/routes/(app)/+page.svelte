<script lang="ts">
	import { useLiveQuery } from '@tanstack/svelte-db';
	import { inboxAnnouncements, workWithContext } from '#lib/db/queries.ts';
	import { summarize, byDue, isOpen, type WorkSummary } from '#lib/work.ts';
	import { groupBy } from '#lib/group.ts';
	import WorkItem from '#lib/components/work-item.svelte';
	import PageHeader from '#lib/components/page-header.svelte';
	import Announcement from '#lib/components/announcement.svelte';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { dayLabel, dueDayStart } from '#lib/format.ts';
	import { displayName } from '#lib/course.ts';
	import { greeting, pluralize } from '#lib/text.ts';
	import PartyPopperIcon from '@lucide/svelte/icons/party-popper';

	let { data } = $props();
	const now = Date.now();

	const rows = useLiveQuery({ query: workWithContext });
	const stream = useLiveQuery({
		query: (q) =>
			inboxAnnouncements(q)
				.orderBy(({ a }) => a.updatedAt, 'desc')
				.limit(12)
	});

	const work = $derived(
		rows.data.map((r) => summarize(r.w, r.s ?? undefined, displayName(r.c), now)).sort(byDue)
	);
	const open = $derived(work.filter(isOpen));
	const missing = $derived(open.filter((w) => w.status === 'missing'));

	type Group = { key: string; label: string; items: WorkSummary[] };
	const groups = $derived.by(() => {
		const map = groupBy(
			open.filter((w) => w.dueAt !== undefined && w.dueAt >= now).slice(0, 30),
			(w) => dueDayStart(w.dueAt!, w.hasDueTime)
		);
		const out: Group[] = [];
		if (missing.length)
			out.push({ key: 'missing', label: 'Overdue', items: missing.slice(-8).reverse() });
		for (const [day, items] of [...map.entries()].sort((a, b) => a[0] - b[0]))
			out.push({ key: String(day), label: dayLabel(day, now), items });
		return out;
	});

	const courseCount = $derived(new Set(work.map((w) => w.courseId)).size);
	const firstName = $derived(data.snapshot.profile?.name?.split(' ')[0]);
	const subtitle = $derived(
		open.length
			? `You have ${pluralize(open.length, 'open assignment')} across ${pluralize(courseCount, 'course')}.`
			: 'Nothing outstanding right now.'
	);
</script>

<PageHeader title={`${greeting()}${firstName ? `, ${firstName}` : ''}`} description={subtitle} />

<div class="mt-10 grid gap-12 *:min-w-0 lg:grid-cols-[3fr_2fr]">
	<section>
		<div class="flex items-baseline justify-between">
			<h2 class="text-lg font-semibold tracking-tight">Up next</h2>
			<Button variant="link" size="sm" href="/todo" class="px-0">View all</Button>
		</div>
		{#if groups.length === 0}
			<Empty.Root class="mt-4 border border-dashed">
				<Empty.Header>
					<Empty.Media variant="icon"><PartyPopperIcon /></Empty.Media>
					<Empty.Title>All caught up</Empty.Title>
					<Empty.Description>No upcoming or overdue work. Enjoy the break.</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{:else}
			<div class="mt-2 divide-y divide-border/60">
				{#each groups as group (group.key)}
					<div class="py-4">
						<h3
							class={`text-sm font-medium ${group.key === 'missing' ? 'text-destructive' : 'text-muted-foreground'}`}
						>
							{group.label}
						</h3>
						<div class="mt-1 flex flex-col">
							{#each group.items as item (item.id)}
								<WorkItem work={item} />
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>
	<section>
		<h2 class="text-lg font-semibold tracking-tight">Stream</h2>
		<div class="mt-2 divide-y divide-border/60">
			{#each stream.data as row (row.a.id)}
				<Announcement item={row.a} course={row.c} clamp />
			{:else}
				<p class="py-4 text-sm text-muted-foreground">No announcements yet.</p>
			{/each}
		</div>
	</section>
</div>
