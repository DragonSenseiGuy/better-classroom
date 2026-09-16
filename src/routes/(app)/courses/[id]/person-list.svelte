<script lang="ts">
	import UserAvatar from '#lib/components/user-avatar.svelte';

	type Person = { userId?: string; name?: string; email?: string; photoUrl?: string };
	let { people, variant }: { people: Person[]; variant: 'teacher' | 'student' } = $props();

	const teacher = $derived(variant === 'teacher');
</script>

<ul role="list" class="mt-2 divide-y divide-border/60">
	{#each people as p, i (teacher ? p.userId : (p.email ?? `${p.name}#${i}`))}
		<li class="flex items-center gap-3 {teacher ? 'py-3' : 'py-2.5'}">
			<UserAvatar
				src={p.photoUrl}
				name={p.name}
				class={teacher ? 'size-9' : 'size-8'}
				fallbackClass="text-xs"
			/>
			<div class="min-w-0">
				{#if teacher}
					<p class="text-sm font-medium">{p.name ?? 'Teacher'}</p>
				{:else}
					<p class="truncate text-sm font-medium">{p.name}</p>
				{/if}
				{#if p.email}<a
						href={`mailto:${p.email}`}
						class="{teacher ? 'text-sm' : 'text-xs'} text-muted-foreground hover:text-foreground"
						>{p.email}</a
					>{/if}
			</div>
		</li>
	{/each}
</ul>
