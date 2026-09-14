<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { Toaster } from '#lib/components/ui/sonner/index.js';
	import { titleBadge } from '#lib/title.svelte.ts';
	import { theme } from '#lib/theme.svelte.ts';
	import { themeCss } from '#lib/themes.ts';

	let { children } = $props();
	const title = $derived(
		`${titleBadge.count ? `(${titleBadge.count}) ` : ''}${page.data.title ? `${page.data.title} · Classroom` : 'Classroom'}`
	);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>{title}</title>
	{@html `<style>${themeCss}</style>`}
</svelte:head>

{@render children()}

<Toaster position="bottom-right" closeButton theme={theme.resolved} />
