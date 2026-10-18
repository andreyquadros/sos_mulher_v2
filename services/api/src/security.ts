import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

/** Only a private/loopback immediate peer can begin a configured proxy chain. */
export function trustPrivateProxy(hops: number): false | ((address: string, hop: number) => boolean) {
  if (hops === 0) return false;
  return (address, hop) => {
    if (hop >= hops) return false;
    if (hop > 0) return true;
    const peer = address.toLowerCase().replace(/^::ffff:/, '');
    if (isIP(peer) === 4) {
      const [first, second] = peer.split('.').map(Number);
      return first === 127 || first === 10 || (first === 172 && second! >= 16 && second! <= 31) || (first === 192 && second === 168);
    }
    return isIP(peer) === 6 && (peer === '::1' || /^f[cd]/.test(peer));
  };
}

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
