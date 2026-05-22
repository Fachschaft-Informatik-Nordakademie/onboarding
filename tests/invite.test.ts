import { describe, it, expect, beforeAll } from 'vitest';
import { BASE, BACKDOOR, testSetup } from './helpers';

const POST_INVITE = (body: object, cookies = '', dryRun = true) =>
  fetch(`${BASE}/api/invite?mode=test${dryRun ? '&dryRun=true' : ''}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookies ? { Cookie: cookies } : {}) },
    body: JSON.stringify(body),
  });

const VALID_BODY = {
  fullName: 'Max Mustermann',
  zenturie: 'WI-23',
  email: 'test@nordakademie.de',
  heardFrom: 'event',
  interests: [],
};

const describeWithBackdoor = BACKDOOR ? describe : describe.skip;

// ── Tests that don't need a valid session ──────────────────────────────────

describe('invite API — unauthenticated / validation', () => {
  it('rejects request without ev_token cookie → 403', async () => {
    const res = await POST_INVITE(VALID_BODY);
    expect(res.status).toBe(403);
  });

  it('rejects request with fake ev_token → 403', async () => {
    const res = await POST_INVITE(VALID_BODY, 'ev_token=fake-token-that-does-not-exist');
    expect(res.status).toBe(403);
  });

  it('rejects missing fullName → 422', async () => {
    const res = await POST_INVITE({ ...VALID_BODY, fullName: '' }, 'ev_token=fake');
    expect(res.status).toBeOneOf([422, 403]); // 403 wins (auth checked first)
  });

  it('rejects non-NAK email → 422', async () => {
    const res = await POST_INVITE({ ...VALID_BODY, email: 'test@gmail.com' }, 'ev_token=fake');
    expect(res.status).toBeOneOf([422, 403]);
  });

  it('rejects malformed JSON → 400', async () => {
    const res = await fetch(`${BASE}/api/invite?mode=test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    expect(res.status).toBe(400);
  });
});

// ── Tests that need the backdoor to inject server state ───────────────────

describeWithBackdoor('invite API — authenticated flow (backdoor)', () => {
  let cookies = '';

  beforeAll(async () => {
    cookies = await testSetup('test@nordakademie.de', 'Raindancer118');
    expect(cookies).toContain('ev_token=');
    expect(cookies).toContain('gh_user=');
  });

  it('rejects when ev_token email does not match body email', async () => {
    const res = await POST_INVITE(
      { ...VALID_BODY, email: 'other@nordakademie.de' },
      cookies,
    );
    expect(res.status).toBe(403);
    const body = await res.json() as { message: string };
    expect(body.message).toContain('verifiziert');
  });

  it('rejects missing zenturie', async () => {
    // Need fresh cookies because ev_token is consumed on success
    const c = await testSetup('test@nordakademie.de', 'Raindancer118');
    const res = await POST_INVITE({ ...VALID_BODY, zenturie: '' }, c);
    expect(res.status).toBe(422);
    const body = await res.json() as { message: string };
    expect(body.message).toContain('Zenturie');
  });

  it('rejects fullName over 100 chars', async () => {
    const c = await testSetup('test@nordakademie.de', 'Raindancer118');
    const res = await POST_INVITE({ ...VALID_BODY, fullName: 'A'.repeat(101) }, c);
    expect(res.status).toBe(422);
  });

  it('rejects missing GitHub connection', async () => {
    const c = await testSetup('test@nordakademie.de', 'Raindancer118');
    // Strip gh_user cookie so only ev_token is present
    const evOnly = c.split('; ').filter(p => p.startsWith('ev_token=')).join('; ');
    const res = await POST_INVITE(VALID_BODY, evOnly);
    expect(res.status).toBe(403);
    const body = await res.json() as { message: string };
    expect(body.message).toContain('GitHub');
  });

  it('full valid invite (dryRun=true): 200, clears cookies', async () => {
    const c = await testSetup('test@nordakademie.de', 'Raindancer118');
    const res = await POST_INVITE(VALID_BODY, c, true);
    expect(res.status).toBe(200);
    const body = await res.json() as { message: string };
    expect(body.message).toContain('Raindancer118');

    // Response should clear ev_token and gh_user
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('ev_token=');
    expect(setCookie).toContain('Max-Age=0');
  });

  it('full valid invite with LAN interest returns lanPartyInvite link', async () => {
    const c = await testSetup('test@nordakademie.de', 'Raindancer118');
    const res = await POST_INVITE({ ...VALID_BODY, interests: ['lan-party'] }, c, true);
    expect(res.status).toBe(200);
    const body = await res.json() as { lanPartyInvite: string | null };
    expect(body.lanPartyInvite).toBeTruthy();
    expect(body.lanPartyInvite).toContain('discord.gg');
  });

  it('full invite with real email send (dryRun=false) — skipped unless TEST_SEND_EMAIL=1', async () => {
    if (process.env.TEST_SEND_EMAIL !== '1') return;
    const c = await testSetup('test@nordakademie.de', 'Raindancer118');
    const res = await POST_INVITE(VALID_BODY, c, false);
    expect(res.status).toBe(200);
  });
});
