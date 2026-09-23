<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import LoaderIcon from '@lucide/svelte/icons/loader-circle';

	interface Props {
		cookie: string;
		testing: boolean;
		error?: string | null;
		onConnect: () => void;
	}

	let { cookie = $bindable(), testing, error, onConnect }: Props = $props();
</script>

<p class="mt-2 text-sm text-muted-foreground">
	Paste a Classroom cookie and the app syncs courses and posts through your signed-in session — no
	script deployment. Grades are unavailable in this mode, and due dates may be missing until the web
	format is mapped.
</p>
<ol class="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
	<li>Open classroom.google.com/u/0/h/st signed in with your school account.</li>
	<li>Open DevTools → Network, reload, click the first classroom.google.com request.</li>
	<li>Under Request Headers copy the whole <code>Cookie</code> value.</li>
</ol>
<textarea
	bind:value={cookie}
	rows="4"
	spellcheck="false"
	placeholder="SID=…; HSID=…; SSID=…; APISID=…; SAPISID=…; …"
	class="mt-2 w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
></textarea>
{#if error}
	<p class="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
{/if}
<Button size="sm" class="mt-2" onclick={onConnect} disabled={testing || !cookie.trim()}>
	{#if testing}<LoaderIcon data-icon="inline-start" class="animate-spin" />Checking{:else}Test and
		connect{/if}
</Button>
