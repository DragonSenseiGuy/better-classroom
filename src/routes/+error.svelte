<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '#lib/components/ui/button/index.js';
</script>

<div class="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-4 px-4 py-10">
	<p class="text-sm text-muted-foreground">{page.status}</p>
	<h1 class="text-2xl font-semibold tracking-tight">Something went wrong</h1>
	<p class="text-sm break-words text-muted-foreground">{page.error?.message}</p>
	<div class="flex gap-2">
		<Button size="sm" href="/">Go home</Button>
		<Button size="sm" variant="outline" onclick={() => location.reload()}>Reload</Button>
	</div>
</div>
