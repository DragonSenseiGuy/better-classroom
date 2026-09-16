import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

let key: Buffer | null = null;

export function configureSecrets(secret: string) {
	key = createHash('sha256').update(secret).digest();
}

function requireKey(): Buffer {
	if (!key) throw new Error('Secrets are not configured; call configureSecrets first.');
	return key;
}

export function seal(plaintext: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', requireKey(), iv);
	const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}

export function open(sealed: string): string {
	const raw = Buffer.from(sealed, 'base64');
	const decipher = createDecipheriv('aes-256-gcm', requireKey(), raw.subarray(0, 12));
	decipher.setAuthTag(raw.subarray(12, 28));
	return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}
