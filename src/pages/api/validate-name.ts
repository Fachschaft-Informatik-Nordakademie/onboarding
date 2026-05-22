export const prerender = false;

import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  let name: string;
  try {
    const body = await request.json();
    name = body?.name?.trim() ?? '';
  } catch {
    return json({ valid: false }, 400);
  }

  if (!name || name.length > 100) return json({ valid: false }, 200);

  const volKey = process.env.VOLANTIC_API_KEY;
  if (!volKey) return json({ valid: true }, 200); // fail open if not configured

  try {
    const aiRes = await fetch('https://apis.volantic.de/api/ai/v1/auto', {
      method: 'POST',
      headers: { Authorization: `Bearer ${volKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'fast',
        max_tokens: 10,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: 'You are a name validator. Respond with ONLY valid JSON: {"isName":true} or {"isName":false}. isName is true if the input looks like a plausible real human name (first name + last name, possibly with middle names, hyphens, apostrophes, umlauts, or culturally diverse naming conventions). isName is false for nonsense, emojis, numbers, memes, or clearly non-name strings.',
          },
          { role: 'user', content: name },
        ],
      }),
    });

    if (!aiRes.ok) return json({ valid: true }, 200); // fail open on API error

    const data = await aiRes.json();
    const raw = data?.choices?.[0]?.message?.content?.trim() ?? '';
    const match = raw.match(/\{.*\}/s);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return json({ valid: parsed.isName !== false }, 200);
    }
  } catch {
    // fail open
  }

  return json({ valid: true }, 200);
};

function json(body: object, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
