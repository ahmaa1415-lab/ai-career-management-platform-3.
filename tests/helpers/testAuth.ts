import { createSession, hashToken, invalidateSessionToken } from '../../lib/auth';
import db from '../../lib/db';

export interface TestAuthContext {
  userId: string;
  token: string;
  cookieHeader: string;
  authorizationHeader: string;
  headers: Record<string, string>;
}

/**
 * Creates an authentic synthetic test session and returns authorization headers.
 * Does NOT mutate production database or bypass authentication checks.
 */
export function getTestAuthContext(userId: string = 'user_default_01'): TestAuthContext {
  // Ensure user exists in users table
  db.prepare(`
    INSERT OR IGNORE INTO users (id, email, full_name, role)
    VALUES (?, ?, ?, 'candidate')
  `).run(userId, `${userId}@synthetic-test.local`, `Synthetic User ${userId}`);

  const session = createSession(userId, {
    rememberMe: true,
    userAgent: 'IntegrationTestSuite/1.0',
    ipAddress: '127.0.0.1'
  });

  return {
    userId,
    token: session.token,
    cookieHeader: `career_session=${session.token}`,
    authorizationHeader: `Bearer ${session.token}`,
    headers: {
      'Cookie': `career_session=${session.token}`,
      'Authorization': `Bearer ${session.token}`
    }
  };
}

/**
 * Creates an expired synthetic session for negative testing.
 */
export function createExpiredTestSession(userId: string = 'user_default_01'): string {
  const expiredToken = 'expired_' + Math.random().toString(36).substring(2);
  const tokenHash = hashToken(expiredToken);
  const sessionId = `sess_exp_${Date.now()}`;
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, expires_at, user_agent, ip_address)
    VALUES (?, ?, ?, ?, 'ExpiredTestAgent', '127.0.0.1')
  `).run(sessionId, userId, tokenHash, yesterday);

  return expiredToken;
}
