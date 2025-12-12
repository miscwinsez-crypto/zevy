const cache = new Map();

export function set(key: string, value: any, ttl: number) {
  const expires = Date.now() + ttl;
  cache.set(key, { value, expires });
}

export function get(key: string) {
  const cached = cache.get(key);
  if (cached && Date.now() < cached.expires) {
    return cached.value;
  }
  cache.delete(key);
  return null;
}