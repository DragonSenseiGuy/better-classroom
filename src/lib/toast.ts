import { toast } from 'svelte-sonner';

export type Tone = 'sky' | 'amber' | 'emerald' | 'rose' | 'violet' | 'pink';

const tones: Record<Tone, string> = {
	sky: '!bg-sky-100 !text-sky-950 !border-sky-300 dark:!bg-sky-300 dark:!text-sky-950',
	amber: '!bg-amber-100 !text-amber-950 !border-amber-300 dark:!bg-amber-200 dark:!text-amber-950',
	emerald:
		'!bg-emerald-100 !text-emerald-950 !border-emerald-300 dark:!bg-emerald-200 dark:!text-emerald-950',
	rose: '!bg-rose-100 !text-rose-950 !border-rose-300 dark:!bg-rose-200 dark:!text-rose-950',
	violet:
		'!bg-violet-100 !text-violet-950 !border-violet-300 dark:!bg-violet-200 dark:!text-violet-950',
	pink: '!bg-pink-100 !text-pink-950 !border-pink-300 dark:!bg-pink-200 dark:!text-pink-950'
};

export function notify(
	tone: Tone,
	message: string,
	options: {
		description?: string;
		action?: { label: string; onClick: () => void | Promise<void> };
		duration?: number;
	} = {}
) {
	return toast(message, {
		description: options.description,
		duration: options.duration ?? 5000,
		class: tones[tone],
		descriptionClass: '!text-inherit opacity-80',
		actionButtonStyle: 'background: rgb(0 0 0 / 0.12); color: inherit; font-weight: 500;',
		action: options.action
			? { label: options.action.label, onClick: () => void options.action!.onClick() }
			: undefined
	});
}

export const dismissToast = (id: string | number) => toast.dismiss(id);
