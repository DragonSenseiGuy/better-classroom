<script lang="ts">
	import * as Avatar from '#lib/components/ui/avatar/index.js';
	import { avatarUrl, initials } from '#lib/format.ts';
	import { cn } from '#lib/utils.js';

	let {
		src,
		name,
		class: className,
		fallbackClass
	}: { src?: string; name?: string; class?: string; fallbackClass?: string } = $props();
	const url = $derived(avatarUrl(src));
</script>

<Avatar.Root class={cn('relative', className)}>
	<Avatar.Fallback class={fallbackClass}>{initials(name)}</Avatar.Fallback>
	{#if url}
		<img
			src={url}
			alt=""
			decoding="async"
			class="absolute inset-0 size-full rounded-[inherit] object-cover"
		/>
	{/if}
</Avatar.Root>
