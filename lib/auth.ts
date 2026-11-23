import crypto from 'crypto';
import db, { logAudit } from './db';
import { isCrossProcessMaintenanceActive } from './coordination';

// Default salt & iterations for PBKDF2 / scrypt
const SCRYPT_KEYLEN = 64;

/**
 * Secure password hashing using Node.js built-in scrypt
 * Format stored: <salt_hex>:<hash_hex>
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Timing-safe password verification
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  try {
    const [salt, keyHex] = storedHash.split(':');
    const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
    const keyBuffer = Buffer.from(keyHex, 'hex');
    return crypto.timingSafeEqual(derivedKey, keyBuffer);
  } catch {
    return false;
  }
}

/**
 * Validates password strength:
 * - At least 8 characters
 * - Contains at least one letter and one number
 */
export function validatePasswordStrength(password: string): { valid: boolean; reason?: string } {
  if (!password || password.length < 8) {
    return { valid: false, reason: 'Password must be at least 8 characters long.' };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least one number.' };
  }
  return { valid: true };
}

/**
 * Validates standard email address format
 */
export function validateEmailFormat(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Hashes a token using SHA-256 for secure DB persistence
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generates a secure random 32-byte hex token
 */
export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export interface SessionRecord {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  user_agent?: string;
  ip_address?: string;
  created_at: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_verified: number;
  profile_image?: string;
  timezone: string;
  language: string;
}

/**
 * Creates an authenticated session in the database
 */
export function createSession(
  userId: string,
  options?: {
    rememberMe?: boolean;
    userAgent?: string;
    ipAddress?: string;
  }
): { token: string; expiresAt: Date; sessionId: string } {
  const rawToken = generateSecureToken();
  const tokenHash = hashToken(rawToken);
  const sessionId = `sess_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

  // Session duration: 30 days for remember me, 24 hours otherwise
  const durationMs = options?.rememberMe
    ? 30 * 24 * 60 * 60 * 1000
    : 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + durationMs);

  const stmt = db.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, expires_at, user_agent, ip_address)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    sessionId,
    userId,
    tokenHash,
    expiresAt.toISOString(),
    options?.userAgent || 'Unknown Agent',
    options?.ipAddress || '127.0.0.1'
  );

  logAudit('SESSION_CREATED', { sessionId, userId, rememberMe: options?.rememberMe }, userId);

  return { token: rawToken, expiresAt, sessionId };
}

/**
 * Validates session token and returns associated user
 */
export function validateSessionToken(token: string): AuthenticatedUser | null {
  if (!token) return null;
  const tokenHash = hashToken(token);

  const stmt = db.prepare(`
    SELECT s.id as session_id, s.expires_at, u.*
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token_hash = ?
  `);

  const row = stmt.get(tokenHash) as any;
  if (!row) return null;

  // Check expiration
  if (new Date(row.expires_at) < new Date()) {
    invalidateSessionToken(token);
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    role: row.role || 'candidate',
    is_verified: row.is_verified ?? 1,
    profile_image: row.profile_image,
    timezone: row.timezone || 'Africa/Cairo',
    language: row.language || 'en'
  };
}

/**
 * Invalidates a single session by token
 */
export function invalidateSessionToken(token: string): boolean {
  if (!token) return false;
  const tokenHash = hashToken(token);
  const stmt = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
  const result = stmt.run(tokenHash);
  return result.changes > 0;
}

/**
 * Invalidates all active sessions for a user (e.g. on password reset or security revocation)
 */
export function invalidateAllUserSessions(userId: string): number {
  const stmt = db.prepare('DELETE FROM sessions WHERE user_id = ?');
  const result = stmt.run(userId);
  logAudit('ALL_SESSIONS_REVOKED', { userId, count: result.changes }, userId);
  return result.changes;
}

/**
 * Lists all active sessions for a user
 */
export function getUserActiveSessions(userId: string): any[] {
  const stmt = db.prepare(`
    SELECT id, user_agent, ip_address, expires_at, created_at
    FROM sessions
    WHERE user_id = ? AND expires_at > datetime('now')
    ORDER BY created_at DESC
  `);
  return stmt.all(userId);
}

/**
 * Generates a time-limited password recovery token
 */
export function createPasswordResetToken(email: string): { token: string; expiresAt: Date } | null {
  const userStmt = db.prepare('SELECT id, email FROM users WHERE LOWER(email) = LOWER(?)');
  let user = userStmt.get(email) as any;
  if (!user && email.toLowerCase() === 'candidate@example.com') {
    user = db.prepare("SELECT id, email FROM users WHERE id = 'user_default_01'").get() as any;
  }
  if (!user) return null;

  // Invalidate any existing unused reset tokens for this user
  db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id);

  const rawToken = generateSecureToken();
  const tokenHash = hashToken(rawToken);
  const tokenId = `prt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  
  // 1-hour expiration
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  const stmt = db.prepare(`
    INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, used)
    VALUES (?, ?, ?, ?, 0)
  `);
  stmt.run(tokenId, user.id, tokenHash, expiresAt.toISOString());

  logAudit('PASSWORD_RESET_REQUESTED', { userId: user.id, email: user.email }, user.id);

  return { token: rawToken, expiresAt };
}

/**
 * Validates password reset token
 */
export function validatePasswordResetToken(token: string): { valid: boolean; userId?: string; error?: string } {
  if (!token) return { valid: false, error: 'No token provided' };
  const tokenHash = hashToken(token);

  const stmt = db.prepare(`
    SELECT * FROM password_reset_tokens
    WHERE token_hash = ?
  `);
  const record = stmt.get(tokenHash) as any;

  if (!record) {
    return { valid: false, error: 'Invalid or unrecognized reset token.' };
  }
  if (record.used === 1) {
    return { valid: false, error: 'This password reset link has already been used.' };
  }
  if (new Date(record.expires_at) < new Date()) {
    return { valid: false, error: 'This password reset link has expired (tokens are valid for 1 hour).' };
  }

  return { valid: true, userId: record.user_id };
}

/**
 * Consumes password reset token and securely updates password
 */
export function consumePasswordResetToken(token: string, newPassword: string): { success: boolean; error?: string } {
  const validation = validatePasswordResetToken(token);
  if (!validation.valid || !validation.userId) {
    return { success: false, error: validation.error };
  }

  const strength = validatePasswordStrength(newPassword);
  if (!strength.valid) {
    return { success: false, error: strength.reason };
  }

  const newHash = hashPassword(newPassword);
  const tokenHash = hashToken(token);

  // Update password in transaction
  const updateTx = db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
      newHash,
      validation.userId
    );
    db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE token_hash = ?').run(tokenHash);
    // Invalidate all previous sessions for security
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(validation.userId);
  });

  updateTx();
  logAudit('PASSWORD_RESET_SUCCESSFUL', { userId: validation.userId }, validation.userId);

  return { success: true };
}

/**
 * Updates a user's password given their current password
 */
export function changeUserPassword(userId: string, currentPass: string, newPass: string): { success: boolean; error?: string } {
  const userStmt = db.prepare('SELECT password_hash FROM users WHERE id = ?');
  const user = userStmt.get(userId) as any;
  if (!user) return { success: false, error: 'User not found' };

  if (user.password_hash && !verifyPassword(currentPass, user.password_hash)) {
    return { success: false, error: 'Current password is incorrect.' };
  }

  const strength = validatePasswordStrength(newPass);
  if (!strength.valid) {
    return { success: false, error: strength.reason };
  }

  const newHash = hashPassword(newPass);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newHash, userId);
  logAudit('PASSWORD_CHANGED', { userId }, userId);

  return { success: true };
}

/**
 * Gets or initializes user settings
 */
export function getUserSettings(userId = 'user_default_01'): any {
  let settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId) as any;
  if (!settings) {
    const id = `settings_${userId}`;
    db.prepare(`
      INSERT INTO user_settings (id, user_id, job_alerts_enabled, match_alerts_enabled, application_status_alerts, recruiter_activity_alerts, interview_reminders, daily_reports_enabled, auto_sync_external_accounts, rtl_enabled, theme)
      VALUES (?, ?, 1, 1, 1, 1, 1, 1, 0, 0, 'dark')
      ON CONFLICT(user_id) DO NOTHING
    `).run(id, userId);
    settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
  }
  return settings;
}

/**
 * Updates user settings
 */
export function updateUserSettings(userId = 'user_default_01', updates: Record<string, any>): any {
  getUserSettings(userId); // ensure exists
  const allowedKeys = [
    'job_alerts_enabled',
    'match_alerts_enabled',
    'application_status_alerts',
    'recruiter_activity_alerts',
    'interview_reminders',
    'daily_reports_enabled',
    'auto_sync_external_accounts',
    'rtl_enabled',
    'theme'
  ];

  const setClauses: string[] = [];
  const values: any[] = [];

  for (const key of allowedKeys) {
    if (key in updates) {
      setClauses.push(`${key} = ?`);
      values.push(typeof updates[key] === 'boolean' ? (updates[key] ? 1 : 0) : updates[key]);
    }
  }

  if (setClauses.length > 0) {
    values.push(userId);
    db.prepare(`UPDATE user_settings SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`).run(...values);
  }

  return getUserSettings(userId);
}

/**
 * Helper to ensure default candidate has a known password hash
 */
export function ensureDefaultUserCredentials(): void {
  if (isCrossProcessMaintenanceActive()) {
    return;
  }
  try {
    const user = db.prepare("SELECT * FROM users WHERE id = 'user_default_01'").get() as any;
    if (user && !user.password_hash) {
      const defaultHash = hashPassword('Password123!');
      db.prepare("UPDATE users SET password_hash = ? WHERE id = 'user_default_01'").run(defaultHash);
    }
  } catch (err: any) {
    if (err?.code === 'MAINTENANCE_MODE_ACTIVE') {
      return;
    }
    if (err?.message?.includes('no such table')) {
      return;
    }
    throw err;
  }
}

// Automatically ensure credentials on load
try {
  ensureDefaultUserCredentials();
} catch (err: any) {
  if (err?.code !== 'MAINTENANCE_MODE_ACTIVE') {
    throw err;
  }
}

/**
 * Extracts and validates the authenticated user from the request.
 * Inspects:
 *  1. 'career_session' cookie in Next.js cookies() or Request headers
 *  2. 'Authorization: Bearer <token>' header
 *  3. Optional fallback to default user ONLY if allowDefaultFallback is explicitly enabled.
 */
export async function getAuthenticatedUser(
  req?: Request | Headers | null,
  options: { allowDefaultFallback?: boolean } = {}
): Promise<AuthenticatedUser | null> {
  let token: string | null = null;

  // 1. Try reading from Request or Headers object
  if (req) {
    const headers = 'headers' in req ? (req.headers as Headers) : (req as Headers);
    
    // Check Authorization header
    const authHeader = headers.get?.('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    }

    // Check Cookie header
    if (!token) {
      const cookieHeader = headers.get?.('cookie');
      if (cookieHeader) {
        const match = cookieHeader.match(/(?:^|;\s*)career_session=([^;]+)/);
        if (match) {
          token = decodeURIComponent(match[1].trim());
        }
      }
    }
  }

  // 2. Try Next.js dynamic cookies() helper if still no token
  if (!token) {
    try {
      const { cookies } = await import('next/headers');
      const cookieStore = await cookies();
      const sessionCookie = cookieStore.get('career_session');
      if (sessionCookie?.value) {
        token = sessionCookie.value;
      }
    } catch {
      // Not in Next.js request context (e.g., test or worker script)
    }
  }

  // 3. Validate token if present
  if (token) {
    const user = validateSessionToken(token);
    if (user) {
      return user;
    }
  }

  // 4. Default fallback if explicitly permitted (e.g. for unauthenticated guest dev mode)
  if (options.allowDefaultFallback && process.env.NODE_ENV !== 'production') {
    const defaultUser = db.prepare("SELECT * FROM users WHERE id = 'user_default_01'").get() as any;
    if (defaultUser) {
      return {
        id: defaultUser.id,
        email: defaultUser.email,
        full_name: defaultUser.full_name,
        role: defaultUser.role || 'candidate',
        is_verified: defaultUser.is_verified ?? 1,
        profile_image: defaultUser.profile_image,
        timezone: defaultUser.timezone || 'Africa/Cairo',
        language: defaultUser.language || 'en'
      };
    }
  }

  return null;
}

