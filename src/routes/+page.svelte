<script lang="ts">
	import { useLiveQuery, eq } from '@tanstack/svelte-db';
	import { announcements, courses } from '#lib/db/collections.ts';
	import { workWithContext } from '#lib/db/queries.ts';
	import { summarize, byDue, type WorkSummary } from '#lib/work.ts';
	import WorkItem from '#lib/components/work-item.svelte';
	import Announcement from '#lib/components/announcement.svelte';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { dayLabel, displayName, dueDayStart, greeting, pluralize } from '#lib/format.ts';
	import PartyPopperIcon from '@lucide/svelte/icons/party-popper';

	let { data } = $props();
	const now = Date.now();
	const DAY = 86_400_000;

	const rows = useLiveQuery({ query: workWithContext });
	const stream = useLiveQuery({
		query: (q) =>
			q
				.from({ a: announcements })
				.innerJoin({ c: courses }, ({ a, c }) => eq(a.courseId, c.id))
				.where(({ c }) => eq(c.hidden, false))
				.orderBy(({ a }) => a.updatedAt, 'desc')
				.limit(12)
	});

	const work = $derived(
		rows.data.map((r) => summarize(r.w, r.s ?? undefined, displayName(r.c), now)).sort(byDue)
	);
	const open = $derived(work.filter((w) => w.status === 'assigned' || w.status === 'missing'));
	const missing = $derived(open.filter((w) => w.status === 'missing'));
	const graded = $derived(
		work.filter((w) => w.status === 'graded' && w.assignedGrade !== undefined && w.maxPoints)
	);
	const average = $derived(
		graded.length
			? Math.round(
					(graded.reduce((s, w) => s + w.assignedGrade! / w.maxPoints!, 0) / graded.length) * 100
				)
			: null
	);

	type Group = { key: string; label: string; items: WorkSummary[] };
	const groups = $derived.by(() => {
		const map = new Map<number, WorkSummary[]>();
		for (const w of open.filter((w) => w.dueAt !== undefined && w.dueAt >= now).slice(0, 30)) {
			const day = dueDayStart(w.dueAt!, w.hasDueTime);
			map.set(day, [...(map.get(day) ?? []), w]);
		}
		const out: Group[] = [];
		if (missing.length)
			out.push({ key: 'missing', label: 'Overdue', items: missing.slice(-8).reverse() });
		for (const [day, items] of [...map.entries()].sort((a, b) => a[0] - b[0]))
			out.push({ key: String(day), label: dayLabel(day, now), items });
		return out;
	});

	const stats = $derived([
		{
			label: 'Due this week',
			value: open.filter((w) => w.dueAt !== undefined && w.dueAt >= now && w.dueAt < now + 7 * DAY)
				.length
		},
		{ label: 'Missing', value: missing.length },
		{ label: 'Awaiting grade', value: work.filter((w) => w.status === 'turnedIn').length },
		{ label: 'Average grade', value: average === null ? '–' : `${average}%` }
	]);
	const courseCount = $derived(new Set(work.map((w) => w.courseId)).size);
	const firstName = $derived(data.snapshot.profile?.name?.split(' ')[0]);
</script>

<h1 class="text-2xl font-semibold tracking-tight text-balance">
	{greeting()}{firstName ? `, ${firstName}` : ''}
</h1>
<p class="mt-1 text-sm text-pretty text-muted-foreground">
	{#if open.length}You have {pluralize(open.length, 'open assignment')} across {pluralize(
			courseCount,
			'course'
		)}.{:else}Nothing outstanding right now.{/if}
</p>

<dl class="mt-6 grid grid-cols-2 gap-y-6 lg:grid-cols-4">
	{#each stats as stat, i (stat.label)}
		<div
			class={`flex flex-col gap-1 border-border/60 ${i % 2 === 1 ? 'border-l pl-6' : 'pr-6'} ${i >= 2 ? 'lg:border-l lg:pl-6' : ''} ${i === 2 ? 'max-lg:pr-6 max-lg:pl-0 lg:pr-6' : ''} ${i === 3 ? 'lg:pr-0' : ''}`}
		>
			<dt class="truncate text-sm text-muted-foreground">{stat.label}</dt>
			<dd class="text-3xl font-semibold tracking-tight tabular-nums">{stat.value}</dd>
		</div>
	{/each}
</dl>

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
