/** Extracts name=value pairs from Set-Cookie headers into a Cookie string. */
export function cookiesFromResponse(res: Response): string {
  const raw: string[] = typeof (res.headers as any).getSetCookie === 'function'
    ? (res.headers as any).getSetCookie()
    : (res.headers.get('set-cookie') ?? '').split(/,(?=\s*[A-Za-z0-9_-]+=)/);
  return raw
    .map(c => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

export const BASE = process.env.TEST_BASE_URL ?? 'https://onboard.nak-inf.de';
export const BACKDOOR = process.env.TEST_BACKDOOR ?? '';

export async function testSetup(email: string, ghUser: string): Promise<string> {
  const res = await fetch(`${BASE}/api/_test-setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ backdoor: BACKDOOR, email, ghUser }),
  });
  if (!res.ok) throw new Error(`_test-setup failed: ${res.status} ${await res.text()}`);
  return cookiesFromResponse(res);
}
