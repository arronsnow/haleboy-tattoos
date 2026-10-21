import { beforeAll, describe, expect, it, vi } from 'vitest';
import { verifyAccess } from '../src/lib/access';

const env = { ACCESS_TEAM_DOMAIN: 'haleboy.cloudflareaccess.com', ACCESS_AUD: 'aud-123', ADMIN_EMAIL: 'Eathan@example.com' };
const ISS = 'https://haleboy.cloudflareaccess.com';
const KID = 'test-kid';

let privateKey: CryptoKey;
let otherKey: CryptoKey;

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = (obj: object) => b64url(new TextEncoder().encode(JSON.stringify(obj)));
const rsa = () =>
  crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  ) as Promise<CryptoKeyPair>;

async function sign(claims: Record<string, unknown>, key = privateKey) {
  const body = `${enc({ alg: 'RS256', kid: KID, typ: 'JWT' })}.${enc(claims)}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

const now = () => Math.floor(Date.now() / 1000);
const good = () => ({ aud: [env.ACCESS_AUD], email: 'eathan@example.com', exp: now() + 600, iat: now(), iss: ISS });
const req = (token?: string) => new Request('https://x/admin', { headers: token ? { 'Cf-Access-Jwt-Assertion': token } : {} });

beforeAll(async () => {
  const pair = await rsa();
  privateKey = pair.privateKey;
  otherKey = (await rsa()).privateKey;
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: KID };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      expect(url).toBe(`${ISS}/cdn-cgi/access/certs`);
      return Response.json({ keys: [jwk] });
    }),
  );
});

describe('verifyAccess', () => {
  it('accepts a valid token for the admin email (case-insensitive)', async () => {
    expect(await verifyAccess(req(await sign(good())), env)).toBe('eathan@example.com');
  });

  it('rejects a missing token', async () => {
    expect(await verifyAccess(req(), env)).toBeNull();
  });

  it('rejects the wrong audience', async () => {
    expect(await verifyAccess(req(await sign({ ...good(), aud: ['someone-else'] })), env)).toBeNull();
  });

  it('rejects a different email', async () => {
    expect(await verifyAccess(req(await sign({ ...good(), email: 'intruder@example.com' })), env)).toBeNull();
  });

  it('rejects an expired token', async () => {
    expect(await verifyAccess(req(await sign({ ...good(), exp: now() - 1 })), env)).toBeNull();
  });

  it('rejects the wrong issuer', async () => {
    expect(await verifyAccess(req(await sign({ ...good(), iss: 'https://evil.cloudflareaccess.com' })), env)).toBeNull();
  });

  it('rejects a token signed by another key', async () => {
    expect(await verifyAccess(req(await sign(good(), otherKey)), env)).toBeNull();
  });

  it('rejects a tampered payload', async () => {
    const [h, , s] = (await sign(good())).split('.');
    expect(await verifyAccess(req(`${h}.${enc({ ...good(), email: 'eathan@example.com', exp: now() + 99999 })}.${s}`), env)).toBeNull();
  });

  it('fails closed when config is missing', async () => {
    expect(await verifyAccess(req(await sign(good())), { ...env, ADMIN_EMAIL: '' })).toBeNull();
  });
});
