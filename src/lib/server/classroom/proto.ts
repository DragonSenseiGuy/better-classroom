export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

type Scalar = 'string' | 'int' | 'bool' | 'json';

export type FieldSpec = {
	name: string;
	type: Scalar | Message<unknown>;
	repeated?: boolean;
	doc?: string;
};

export type Message<T> = {
	name: string;
	tag?: string;
	fields: Record<number, FieldSpec>;
	__type?: T;
};

export const f = (name: string, type: FieldSpec['type'] = 'json', doc?: string): FieldSpec => ({
	name,
	type,
	doc
});
export const rep = (name: string, type: FieldSpec['type'], doc?: string): FieldSpec => ({
	name,
	type,
	repeated: true,
	doc
});

export function message<T>(
	name: string,
	fields: Record<number, FieldSpec>,
	tag?: string
): Message<T> {
	return { name, fields, tag };
}

function decodeValue(value: Json, spec: FieldSpec): unknown {
	if (value === null || value === undefined) return undefined;
	if (spec.repeated) {
		if (!Array.isArray(value)) return undefined;
		return value.map((v) => decodeOne(v, spec.type)).filter((v) => v !== undefined);
	}
	return decodeOne(value, spec.type);
}

function decodeOne(value: Json, type: FieldSpec['type']): unknown {
	if (value === null || value === undefined) return undefined;
	switch (type) {
		case 'string':
			return typeof value === 'string' ? value : String(value);
		case 'int':
			return typeof value === 'number' ? value : Number(value);
		case 'bool':
			return Boolean(value);
		case 'json':
			return value;
		default:
			return decode(value, type);
	}
}

export function decode<T>(value: Json, msg: Message<T>): T | undefined {
	if (!Array.isArray(value)) return undefined;
	const out: Record<string, unknown> = {};
	for (const [num, spec] of Object.entries(msg.fields)) {
		const decoded = decodeValue(value[Number(num) - 1] ?? null, spec);
		if (decoded !== undefined) out[spec.name] = decoded;
	}
	return out as T;
}

export function encode<T>(value: Partial<T>, msg: Message<T>): Json[] {
	const out: Json[] = [];
	const byName = new Map(
		Object.entries(msg.fields).map(([num, spec]) => [spec.name, [Number(num), spec] as const])
	);
	for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
		const entry = byName.get(key);
		if (!entry || raw === undefined) continue;
		const [num, spec] = entry;
		const encodeOne = (v: unknown): Json =>
			typeof spec.type === 'string' ? (v as Json) : encode(v as never, spec.type);
		out[num - 1] = spec.repeated ? (raw as unknown[]).map(encodeOne) : encodeOne(raw);
	}
	for (let i = 0; i < out.length; i++) if (out[i] === undefined) out[i] = null;
	return out;
}

export function describe(msg: Message<unknown>, depth = 0, seen = new Set<string>()): string {
	const pad = '  '.repeat(depth);
	const lines = [`${pad}message ${msg.name}${msg.tag ? ` // tag ${msg.tag}` : ''} {`];
	for (const [num, spec] of Object.entries(msg.fields)) {
		const type = typeof spec.type === 'string' ? spec.type : spec.type.name;
		lines.push(
			`${pad}  ${spec.repeated ? 'repeated ' : ''}${type} ${spec.name} = ${num};${spec.doc ? ` // ${spec.doc}` : ''}`
		);
	}
	lines.push(`${pad}}`);
	for (const spec of Object.values(msg.fields)) {
		if (typeof spec.type === 'string' || seen.has(spec.type.name)) continue;
		seen.add(spec.type.name);
		lines.push(describe(spec.type, depth, seen));
	}
	return lines.join('\n');
}
