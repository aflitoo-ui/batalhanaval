type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/**
 * Limitador simples em memória, por processo — primeira barreira contra
 * tentativas repetidas de senha. Só conta ERROS; login correto nunca consome
 * a cota.
 */
export function isRateLimited(key: string, opts: { max: number; windowMs: number }): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) return false;
  return bucket.count >= opts.max;
}

export function recordRateLimitFailure(key: string, opts: { max: number; windowMs: number }): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return;
  }
  bucket.count++;
}

export function clearRateLimit(key: string): void {
  buckets.delete(key);
}
