import type { AuthSession } from '#lib/server/auth.ts';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: AuthSession['user'] | null;
			session: AuthSession['session'] | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
