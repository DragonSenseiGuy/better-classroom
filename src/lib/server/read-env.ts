import type { StandardSchemaV1 } from '@standard-schema/spec';
import { variables } from '../../env';

type Variables = typeof variables;

export type Env = {
	[K in keyof Variables]: Variables[K]['schema'] extends StandardSchemaV1<
		string | undefined,
		infer O
	>
		? O
		: never;
};

export function readEnv(source: Record<string, string | undefined> = process.env): Env {
	const out: Record<string, unknown> = {};
	for (const [name, { schema }] of Object.entries(variables)) {
		const result = schema['~standard'].validate(source[name]);
		if (result instanceof Promise) throw new Error(`${name}: async validation is not supported`);
		if (result.issues)
			throw new Error(`${name}: ${result.issues.map((i) => i.message).join('; ')}`);
		out[name] = result.value;
	}
	return out as Env;
}
