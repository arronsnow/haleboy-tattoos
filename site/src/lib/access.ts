// Verifies the Cloudflare Access JWT (Cf-Access-Jwt-Assertion) with WebCrypto.
// Access already blocks unauthenticated traffic at the edge; this check stops anything
// that reaches the Worker another way (workers.dev URL, misconfigured policy).

type AccessEnv = Pick<Env, 'ACCESS_TEAM_DOMAIN' | 'ACCESS_AUD' | 'ADMIN_EMAIL'>;

interface Jwk extends JsonWebKey {
  kid?: string;
}

// In-memory per isolate. Refetched when a token names an unknown kid (Access rotates keys).
const jwksCache = new Map<string, Map<string, CryptoKey>>();

function teamOrigin(domain: string): string {
  return `https://${domain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
}

function b64urlBytes(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function b64urlJson(s: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(b64urlBytes(s)));
}

async function loadKeys(origin: string): Promise<Map<string, CryptoKey>> {
  const res = await fetch(`${origin}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access certs fetch failed: ${res.status}`);
  const { keys } = (await res.json()) as { keys: Jwk[] };
  const map = new Map<string, CryptoKey>();
  for (const jwk of keys) {
    if (!jwk.kid || jwk.kty !== 'RSA') continue;
    map.set(jwk.kid, await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']));
  }
  jwksCache.set(origin, map);
  return map;
}

async function keyFor(origin: string, kid: string): Promise<CryptoKey | undefined> {
  return jwksCache.get(origin)?.get(kid) ?? (await loadKeys(origin)).get(kid);
}

/** Returns the admin's email when the request carries a valid Access JWT for ADMIN_EMAIL, else null. */
export async function verifyAccess(request: Request, env: AccessEnv): Promise<string | null> {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ADMIN_EMAIL) return null;

  try {
    const [h, p, sig] = token.split('.');
    if (!h || !p || !sig) return null;
    const header = b64urlJson(h);
    const payload = b64urlJson(p);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;

    const origin = teamOrigin(env.ACCESS_TEAM_DOMAIN);
    const key = await keyFor(origin, header.kid);
    if (!key) return null;
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(sig), new TextEncoder().encode(`${h}.${p}`));
    if (!valid) return null;

    const now = Math.floor(Date.now() / 1000);
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(env.ACCESS_AUD)) return null;
    if (typeof payload.exp !== 'number' || payload.exp <= now) return null;
    if (typeof payload.nbf === 'number' && payload.nbf > now + 60) return null;
    if (payload.iss !== origin) return null;

    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
    return email && email === env.ADMIN_EMAIL.trim().toLowerCase() ? email : null;
  } catch {
    return null; // malformed token or certs unreachable: fail closed
  }
}
