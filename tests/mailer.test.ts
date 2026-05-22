import { describe, it, expect } from 'vitest';
import { BASE, BACKDOOR } from './helpers';

const describeWithBackdoor = BACKDOOR ? describe : describe.skip;

describeWithBackdoor('SMTP connectivity (via _test-smtp endpoint)', () => {
  it('server can connect to SMTP relay', async () => {
    const res = await fetch(`${BASE}/api/test-smtp?backdoor=${encodeURIComponent(BACKDOOR)}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; error?: string; host?: string; user?: string };
    expect(body.ok, body.error ?? 'SMTP verify failed').toBe(true);
  });

  it('SMTP user is noreply@nak-inf.de', async () => {
    const res = await fetch(`${BASE}/api/test-smtp?backdoor=${encodeURIComponent(BACKDOOR)}`);
    const body = await res.json() as { ok: boolean; user?: string };
    if (body.ok) {
      expect(body.user).toBe('noreply@nak-inf.de');
    }
  });

  it('SMTP host is mx.stupanak.de', async () => {
    const res = await fetch(`${BASE}/api/test-smtp?backdoor=${encodeURIComponent(BACKDOOR)}`);
    const body = await res.json() as { ok: boolean; host?: string };
    if (body.ok) {
      expect(body.host).toBe('mx.stupanak.de');
    }
  });
});
