// Per-device verification tokens.
// Set as HttpOnly cookie after email verification; consumed on /api/invite.
export const verifiedTokens = new Map<string, { email: string; expires: number }>();
