<script lang="ts">
	import UserAvatar from '#lib/components/user-avatar.svelte';
	import Attachments from '#lib/components/attachments.svelte';
	import { courseColor, displayName, formatRelative } from '#lib/format.ts';
	import type { Announcement, Course } from '#lib/shared/types.ts';

	let {
		item,
		course,
		showCourse = true,
		clamp = false
	}: { item: Announcement; course: Course; showCourse?: boolean; clamp?: boolean } = $props();
	let expanded = $state(false);
	const long = $derived(clamp && (item.text.length > 400 || item.text.split('\n').length > 6));
	const author = $derived(
		[...course.teachers, ...(course.people ?? [])].find((t) => t.userId === item.creatorUserId)
	);
</script>

<article
	id={`a-${item.id}`}
	class="-mx-3 flex scroll-mt-20 gap-3 rounded-lg px-3 py-4 transition-colors target:bg-accent/60"
>
	<UserAvatar src={author?.photoUrl} name={author?.name} class="size-8" fallbackClass="text-xs" />
	<div class="min-w-0 flex-1">
		<div class="flex flex-wrap items-baseline gap-x-2 text-sm">
			<span class="font-medium">{author?.name ?? 'Teacher'}</span>
			{#if showCourse}
				<a
					href={`/courses/${item.courseId}`}
					class="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
				>
					<span class={`size-1.5 rounded-full ${courseColor(item.courseId)}`}></span>{displayName(
						course
					)}
				</a>
			{/if}
			{#if showCourse}
				<a
					href={`/courses/${item.courseId}?tab=stream#a-${item.id}`}
					class="text-muted-foreground tabular-nums hover:text-foreground hover:underline"
					title="View in course stream"
				>
					<time datetime={new Date(item.createdAt).toISOString()}
						>{formatRelative(item.createdAt)}</time
					>
				</a>
			{:else}
				<time
					datetime={new Date(item.createdAt).toISOString()}
					class="text-muted-foreground tabular-nums">{formatRelative(item.createdAt)}</time
				>
			{/if}
		</div>
		<p
			class={`mt-1 text-sm text-pretty break-words whitespace-pre-wrap ${long && !expanded ? 'line-clamp-6' : ''}`}
		>
			{item.text}
		</p>
		{#if long}
			<button
				type="button"
				class="mt-1 text-sm text-muted-foreground hover:text-foreground"
				onclick={() => (expanded = !expanded)}
			>
				{expanded ? 'Show less' : 'Show more'}
			</button>
		{/if}
		{#if item.materials.length}
			<div class="mt-3 max-w-md"><Attachments items={item.materials} /></div>
		{/if}
	</div>
</article>
