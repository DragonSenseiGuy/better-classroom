<script lang="ts">
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import UserAvatar from '#lib/components/user-avatar.svelte';
	import { Kbd, KbdGroup } from '#lib/components/ui/kbd/index.js';
	import { page } from '$app/state';
	import { afterNavigate } from '$app/navigation';
	import { displayName, type CourseRef as Course } from '#lib/course.ts';
	import { createCourseOrder, type OrderSection } from '#lib/course-reorder.svelte.ts';
	import CourseDot from '#lib/components/course-dot.svelte';
	import CourseMenu from '#lib/components/course-menu.svelte';
	import { editCourse } from '#lib/course-editor.svelte.ts';
	import HouseIcon from '@lucide/svelte/icons/house';
	import ListChecksIcon from '@lucide/svelte/icons/list-checks';
	import InboxIcon from '@lucide/svelte/icons/inbox';
	import SearchIcon from '@lucide/svelte/icons/search';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import ArchiveIcon from '@lucide/svelte/icons/archive';

	type Profile = { name?: string; email?: string; photoUrl?: string } | null;

	let {
		courses,
		archivedCourses = [],
		profile,
		onSearch,
		inboxCount = 0,
		todoCount = 0
	}: {
		courses: Course[];
		archivedCourses?: Course[];
		profile: Profile;
		onSearch: () => void;
		inboxCount?: number;
		todoCount?: number;
	} = $props();

	const sidebar = Sidebar.useSidebar();
	afterNavigate(() => sidebar.setOpenMobile(false));
	const closeOnMobile = () => sidebar.isMobile && sidebar.setOpenMobile(false);

	const order = createCourseOrder(
		() => courses,
		() => archivedCourses
	);

	const nav = $derived([
		{ href: '/', label: 'Home', icon: HouseIcon, count: 0 },
		{ href: '/inbox', label: 'Inbox', icon: InboxIcon, count: inboxCount },
		{ href: '/todo', label: 'To-do', icon: ListChecksIcon, count: todoCount }
	]);
	const isActive = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

{#snippet courseRows(section: OrderSection, dimmed = false)}
	{@const rows = order.ordered(section)}
	{#each rows as course, index (course.id)}
		<Sidebar.MenuItem
			draggable="true"
			aria-grabbed={order.dragId === course.id}
			class={order.overId === course.id && order.dragSection === section
				? 'rounded-md ring-1 ring-sidebar-ring'
				: undefined}
			ondragstart={(e) => order.dragStart(section, course.id, e)}
			ondragover={(e) => order.dragOver(section, course.id, e)}
			ondrop={(e) => order.drop(section, course.id, e)}
			ondragend={order.dragEnd}
		>
			<CourseMenu
				{course}
				onRename={editCourse}
				onMoveUp={index > 0 ? () => order.move(section, course.id, -1) : undefined}
				onMoveDown={index < rows.length - 1 ? () => order.move(section, course.id, 1) : undefined}
			>
				<Sidebar.MenuButton
					isActive={page.url.pathname.startsWith(`/courses/${course.id}`)}
					tooltipContent={displayName(course)}
				>
					{#snippet child({ props })}
						<a
							href={`/courses/${course.id}`}
							{...props}
							class:opacity-70={dimmed}
							title="Drag to reorder"
						>
							<CourseDot id={course.id} size="md" class="shrink-0" />
							<span>{displayName(course)}</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</CourseMenu>
		</Sidebar.MenuItem>
	{/each}
{/snippet}

<Sidebar.Root collapsible="offcanvas">
	<Sidebar.Content>
		<Sidebar.Group>
			<Sidebar.GroupContent>
				<Sidebar.Menu>
					<Sidebar.MenuItem>
						<Sidebar.MenuButton
							onclick={() => {
								closeOnMobile();
								onSearch();
							}}
						>
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
							{#if item.count > 0}
								<Sidebar.MenuBadge class="tabular-nums"
									>{item.count > 99 ? '99+' : item.count}</Sidebar.MenuBadge
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
				<Sidebar.Menu
					aria-label="Courses, drag to reorder"
					ondragover={(e) => {
						if (order.dragId && order.dragSection === 'visible') e.preventDefault();
					}}
					ondrop={(e) => order.dropAtEnd('visible', e)}
				>
					{@render courseRows('visible')}
					{#if courses.length === 0}
						<Sidebar.MenuItem>
							<Sidebar.MenuButton>
								{#snippet child({ props })}
									<a href="/settings" {...props}
										><span class="text-muted-foreground"
											>{archivedCourses.length
												? 'No visible courses — see Archived below'
												: 'No courses synced yet'}</span
										></a
									>
								{/snippet}
							</Sidebar.MenuButton>
						</Sidebar.MenuItem>
					{/if}
				</Sidebar.Menu>
			</Sidebar.GroupContent>
		</Sidebar.Group>
		{#if archivedCourses.length}
			<Sidebar.Group>
				<Sidebar.GroupLabel>
					{#snippet child({ props })}
						<a href="/archived" {...props} class="flex items-center gap-1.5 hover:text-foreground">
							<ArchiveIcon class="size-3.5" />
							<span>Archived ({archivedCourses.length})</span>
						</a>
					{/snippet}
				</Sidebar.GroupLabel>
				<Sidebar.GroupContent>
					<Sidebar.Menu
						aria-label="Archived courses, drag to reorder"
						ondragover={(e) => {
							if (order.dragId && order.dragSection === 'archived') e.preventDefault();
						}}
						ondrop={(e) => order.dropAtEnd('archived', e)}
					>
						{@render courseRows('archived', true)}
					</Sidebar.Menu>
				</Sidebar.GroupContent>
			</Sidebar.Group>
		{/if}
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
