<script lang="ts">
	import { courseColor } from '#lib/course-colors.svelte.ts';

	let {
		id,
		size = 'sm',
		class: className = ''
	}: { id: string; size?: 'sm' | 'md' | 'lg'; class?: string } = $props();

	const SIZE = { sm: 'size-1.5', md: 'size-2', lg: 'size-2.5' } as const;
</script>

<span class={`${SIZE[size]} rounded-full ${courseColor(id)} ${className}`}></span>
