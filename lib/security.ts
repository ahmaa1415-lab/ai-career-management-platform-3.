import db, { logAudit } from './db';

// Adversarial prompt injection signatures commonly embedded in web pages or job descriptions
const ADVERSARIAL_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions/i,
  /system\s*:\s*you\s+are\s+now/i,
  /you\s+must\s+now\s+act\s+as/i,
  /disregard\s+(all\s+)?safety\s+guidelines/i,
  /execute\s+command/i,
  /override\s+permission/i,
  /send\s+all\s+emails?\s+immediately/i,
  /auto-?apply\s+without\s+approval/i,
  /<script[\s\S]*?>[\s\S]*?<\/script>/i,
  /javascript\s*:/i,
];

export function sanitizeUntrustedInput(input: string): string {
  if (!input || typeof input !== 'string') return '';

  // Remove null bytes and dangerous control characters
  let clean = input.replace(/\0/g, '');

  // Strip script tags and dangerous HTML
  clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  clean = clean.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  clean = clean.replace(/on\w+\s*=\s*(["']).*?\1/gi, '');

  return clean.trim();
}

export function detectPromptInjection(content: string): { isMalicious: boolean; matchedPattern?: string } {
  if (!content) return { isMalicious: false };

  for (const pattern of ADVERSARIAL_PATTERNS) {
    if (pattern.test(content)) {
      return {
        isMalicious: true,
        matchedPattern: pattern.toString()
      };
    }
  }

  return { isMalicious: false };
}

export function sanitizeJobOrEmailInput(rawText: string, context = 'external_feed'): { text: string; flagged: boolean; reason?: string } {
  const sanitized = sanitizeUntrustedInput(rawText);
  const injectionCheck = detectPromptInjection(sanitized);

  if (injectionCheck.isMalicious) {
    logAudit('SECURITY_PROMPT_INJECTION_DETECTED', {
      context,
      matched: injectionCheck.matchedPattern,
      preview: sanitized.substring(0, 100)
    });
    return {
      text: '[WARNING: Untrusted external content flagged and quarantined by Security Firewall]',
      flagged: true,
      reason: `Adversarial instruction detected: ${injectionCheck.matchedPattern}`
    };
  }

  return {
    text: sanitized,
    flagged: false
  };
}

// Complete user data export (Data Portability)
export function exportCompleteUserData(userId = 'user_default_01') {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  const location = db.prepare('SELECT * FROM profile_locations WHERE user_id = ?').get(userId);
  const permissions = db.prepare('SELECT * FROM profile_permissions WHERE user_id = ?').get(userId);
  const resumes = db.prepare('SELECT * FROM resumes WHERE user_id = ?').all(userId);
  const applications = db.prepare('SELECT * FROM applications WHERE user_id = ?').all(userId);
  const auditLogs = db.prepare('SELECT * FROM audit_logs WHERE user_id = ?').all(userId);

  return {
    exported_at: new Date().toISOString(),
    user,
    profile,
    location,
    permissions,
    resumes,
    applications,
    auditLogs
  };
}

// Complete user data erasure (Right to Be Forgotten)
export function wipeAllUserData(userId = 'user_default_01') {
  db.transaction(() => {
    db.prepare('DELETE FROM applications WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM resumes WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM profile_permissions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM profile_locations WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM profiles WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  })();

  logAudit('USER_DATA_ERASED', { user_id: userId });
}
