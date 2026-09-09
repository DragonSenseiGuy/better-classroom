<script lang="ts">
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import UserAvatar from '#lib/components/user-avatar.svelte';
	import { Kbd, KbdGroup } from '#lib/components/ui/kbd/index.js';
	import { page } from '$app/state';
	import { courseColor, displayName } from '#lib/format.ts';
	import CourseMenu from '#lib/components/course-menu.svelte';
	import RenameCourseDialog from '#lib/components/rename-course-dialog.svelte';
	import HouseIcon from '@lucide/svelte/icons/house';
	import ListChecksIcon from '@lucide/svelte/icons/list-checks';
	import InboxIcon from '@lucide/svelte/icons/inbox';
	import SearchIcon from '@lucide/svelte/icons/search';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import GraduationCapIcon from '@lucide/svelte/icons/graduation-cap';

	type Course = {
		id: string;
		name: string;
		nickname?: string;
		section?: string;
		alternateLink?: string;
	};
	type Profile = { name?: string; email?: string; photoUrl?: string } | null;

	let {
		courses,
		profile,
		onSearch,
		inboxCount = 0
	}: { courses: Course[]; profile: Profile; onSearch: () => void; inboxCount?: number } = $props();

	let renaming = $state<Course | null>(null);

	const nav = [
		{ href: '/', label: 'Home', icon: HouseIcon },
		{ href: '/inbox', label: 'Inbox', icon: InboxIcon },
		{ href: '/todo', label: 'To-do', icon: ListChecksIcon }
	];
	const isActive = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<Sidebar.Root collapsible="offcanvas">
	<Sidebar.Content>
		<Sidebar.Group>
			<Sidebar.GroupContent>
				<Sidebar.Menu>
					<Sidebar.MenuItem>
						<Sidebar.MenuButton onclick={onSearch}>
							<SearchIcon />
							<span>Search</span>
							<KbdGroup class="ml-auto"><Kbd>⌘</Kbd><Kbd>K</Kbd></KbdGroup>
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
					{#each nav as item (item.href)}
						<Sidebar.MenuItem>
							<Sidebar.MenuButton isActive={isActive(item.href)}>
								{#snippet child({ props })}
									<a href={item.href} {...props}><item.icon /><span>{item.label}</span></a>
								{/snippet}
							</Sidebar.MenuButton>
							{#if item.href === '/inbox' && inboxCount > 0}
								<Sidebar.MenuBadge class="tabular-nums"
									>{inboxCount > 99 ? '99+' : inboxCount}</Sidebar.MenuBadge
								>
							{/if}
						</Sidebar.MenuItem>
					{/each}
				</Sidebar.Menu>
			</Sidebar.GroupContent>
		</Sidebar.Group>
		<Sidebar.Group>
			<Sidebar.GroupLabel>Courses</Sidebar.GroupLabel>
			<Sidebar.GroupContent>
				<Sidebar.Menu>
					{#each courses as course (course.id)}
						<Sidebar.MenuItem>
							<CourseMenu {course} onRename={(c) => (renaming = c)}>
								<Sidebar.MenuButton
									isActive={page.url.pathname.startsWith(`/courses/${course.id}`)}
									tooltipContent={displayName(course)}
								>
									{#snippet child({ props })}
										<a href={`/courses/${course.id}`} {...props}>
											<span class={`size-2 shrink-0 rounded-full ${courseColor(course.id)}`}></span>
											<span>{displayName(course)}</span>
										</a>
									{/snippet}
								</Sidebar.MenuButton>
							</CourseMenu>
						</Sidebar.MenuItem>
					{:else}
						<Sidebar.MenuItem>
							<Sidebar.MenuButton>
								{#snippet child({ props })}
									<a href="/settings" {...props}
										><span class="text-muted-foreground">No courses synced yet</span></a
									>
								{/snippet}
							</Sidebar.MenuButton>
						</Sidebar.MenuItem>
					{/each}
				</Sidebar.Menu>
			</Sidebar.GroupContent>
		</Sidebar.Group>
	</Sidebar.Content>
	<Sidebar.Footer>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg" isActive={page.url.pathname.startsWith('/settings')}>
					{#snippet child({ props })}
						<a href="/settings" {...props}>
							<UserAvatar
								src={profile?.photoUrl}
								name={profile?.name}
								class="size-8 rounded-lg"
								fallbackClass="rounded-lg text-xs"
							/>
							<div class="grid min-w-0 leading-tight">
								<span class="truncate font-medium">{profile?.name ?? 'Not synced'}</span>
								<span class="truncate text-xs text-muted-foreground"
									>{profile?.email ?? 'Set up sync'}</span
								>
							</div>
							<SettingsIcon class="ml-auto text-muted-foreground" />
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Footer>
</Sidebar.Root>

<RenameCourseDialog bind:course={renaming} />
