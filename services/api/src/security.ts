import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${(await derive(password, salt)).toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, salt, digest] = encoded.split('$');
  if (algorithm !== 'scrypt' || !salt || !digest || !/^[a-f0-9]{128}$/.test(digest)) return false;
  const actual = await derive(password, salt);
  return timingSafeEqual(Buffer.from(digest, 'hex'), actual);
}

export class ApiError extends Error {
  constructor(public readonly statusCode: number, message: string) { super(message); }
}

export function validateRecentTimestamp(value: string): void {
  const age = Date.now() - Date.parse(value);
  if (!Number.isFinite(age) || age < -300_000 || age > 86_400_000) {
    throw new ApiError(400, 'Data deve estar nas últimas 24 horas e não mais de 5 minutos no futuro.');
  }
}

// Bounded in-memory throttles. Run one API process per SQLite database; put a shared
// gateway rate limit in front of horizontally scaled institutional deployments.
export class RateLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  take(key: string, limit: number, windowMs: number, now = Date.now()): void {
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      if (this.buckets.size >= 20_000) {
        for (const [entry, value] of this.buckets) if (value.resetAt <= now) this.buckets.delete(entry);
        if (this.buckets.size >= 20_000) throw new ApiError(429, 'Muitas solicitações. Aguarde e tente novamente.');
      }
      bucket = { count: 0, resetAt: now + windowMs };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > limit) throw new ApiError(429, 'Muitas solicitações. Aguarde e tente novamente.');
  }
}
