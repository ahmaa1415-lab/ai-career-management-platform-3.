import fs from 'fs';
import path from 'path';
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

// Complete user data export (Data Portability - GDPR Article 20)
export function exportCompleteUserData(userId: string) {
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    throw new Error('Mandatory Parameter Missing: A valid, non-empty userId is required to export user data.');
  }
  const cleanUserId = userId.trim();

  const user = db.prepare('SELECT id, email, full_name, created_at, updated_at FROM users WHERE id = ?').get(cleanUserId);
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(cleanUserId);
  const location = db.prepare('SELECT * FROM profile_locations WHERE user_id = ?').get(cleanUserId);
  const permissions = db.prepare('SELECT * FROM profile_permissions WHERE user_id = ?').get(cleanUserId);
  const resumes = db.prepare('SELECT * FROM resumes WHERE user_id = ?').all(cleanUserId);
  const applications = db.prepare('SELECT * FROM applications WHERE user_id = ?').all(cleanUserId);
  const savedOpportunities = db.prepare('SELECT * FROM saved_opportunities WHERE user_id = ?').all(cleanUserId);
  const portalAccounts = db.prepare('SELECT * FROM company_portal_accounts WHERE user_id = ?').all(cleanUserId);
  const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(cleanUserId);
  const emails = db.prepare(`
    SELECT id, application_id, category, sender, recipient, subject, body, is_draft, is_sent, sent_at, created_at
    FROM emails
    WHERE application_id IN (SELECT id FROM applications WHERE user_id = ?)
       OR (application_id IS NULL AND (recipient = (SELECT email FROM users WHERE id = ?) OR sender = (SELECT email FROM users WHERE id = ?)))
  `).all(cleanUserId, cleanUserId, cleanUserId);
  const auditLogs = db.prepare('SELECT id, action, details, timestamp FROM audit_logs WHERE user_id = ?').all(cleanUserId);

  return {
    exported_at: new Date().toISOString(),
    user,
    profile,
    location,
    permissions,
    resumes,
    applications,
    saved_opportunities: savedOpportunities,
    portal_accounts: portalAccounts,
    settings,
    emails,
    auditLogs
  };
}

export function isPathContained(targetPath: string, allowedParentDir: string): boolean {
  if (!targetPath || typeof targetPath !== 'string') return false;
  const resolvedTarget = path.resolve(targetPath);
  const resolvedParent = path.resolve(allowedParentDir);
  const relative = path.relative(resolvedParent, resolvedTarget);
  // relative must not start with '..' and must not be an absolute path (handles cross-drive Windows paths)
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Durable cross-process coordinator to synchronize physical file deletion with concurrent uploads.
 * Uses a lightweight SQLite table (`file_coordination_leases`) to coordinate across separate Node processes
 * (e.g. Next.js Web Server, Background Workers, Supervisor, and CLI tasks) without requiring external services.
 *
 * Implements mutually exclusive deletion vs reference operations:
 * - Deletion requires an exclusive deletion lease (rejected if any reference or other deletion lease is active).
 * - Uploads require a reference lease (rejected if an active deletion lease exists).
 * - Protects the entire critical interval from upload start to database commit.
 */
export class FileDeletionLockCoordinator {
  private activeDeletions = new Set<string>();
  private activeReferences = new Set<string>();

  private initTable(): void {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS file_coordination_leases (
          file_path TEXT NOT NULL,
          lease_type TEXT NOT NULL,
          locked_by TEXT NOT NULL,
          lease_token TEXT,
          locked_at DATETIME NOT NULL,
          expires_at DATETIME NOT NULL,
          PRIMARY KEY (file_path, locked_by)
        );
        CREATE INDEX IF NOT EXISTS idx_file_coordination_lookup ON file_coordination_leases(file_path, lease_type, expires_at);
      `);
      try {
        db.exec('ALTER TABLE file_coordination_leases ADD COLUMN lease_token TEXT;');
      } catch {}
    } catch {
      // Table may already exist or schema initialized
    }
  }

  isPathDeleting(filePath: string): boolean {
    if (!filePath || typeof filePath !== 'string') return false;
    const canonical = path.resolve(filePath);

    // 1. In-process check
    if (this.activeDeletions.has(canonical)) return true;

    // 2. Cross-process database check
    try {
      this.initTable();
      const now = new Date().toISOString();
      const row = db.prepare(`
        SELECT file_path FROM file_coordination_leases
        WHERE file_path = ? AND lease_type = 'deletion' AND expires_at > ?
      `).get(canonical, now);
      return Boolean(row);
    } catch {
      return this.activeDeletions.has(canonical);
    }
  }

  isPathReferenced(filePath: string): boolean {
    if (!filePath || typeof filePath !== 'string') return false;
    const canonical = path.resolve(filePath);

    if (this.activeReferences.has(canonical)) return true;

    try {
      this.initTable();
      const now = new Date().toISOString();
      const row = db.prepare(`
        SELECT file_path FROM file_coordination_leases
        WHERE file_path = ? AND lease_type = 'reference' AND expires_at > ?
      `).get(canonical, now);
      return Boolean(row);
    } catch {
      return this.activeReferences.has(canonical);
    }
  }

  acquireDeletionLease(filePath: string, leaseDurationMs: number = 30000, holderId?: string, leaseToken?: string): boolean {
    if (!filePath || typeof filePath !== 'string') return false;
    const canonical = path.resolve(filePath);
    const workerTag = holderId || `del_${process.pid}_${Math.random().toString(36).substring(2, 6)}`;
    const token = leaseToken || `tok_del_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + leaseDurationMs);

    // In-process fast check: cannot delete if this process holds an active reference or deletion
    if (this.activeDeletions.has(canonical) || this.activeReferences.has(canonical)) {
      return false;
    }

    try {
      this.initTable();
      // Atomic SQLite transaction for exclusive deletion lease acquisition
      const acquired = db.transaction(() => {
        // 1. Check for ANY active unexpired lease (deletion OR reference) held by another worker
        const existing = db.prepare(`
          SELECT * FROM file_coordination_leases
          WHERE file_path = ? AND expires_at > ?
        `).all(canonical, now.toISOString()) as any[];

        if (existing && existing.length > 0) {
          const otherHolders = existing.filter(e => e.locked_by !== workerTag);
          if (otherHolders.length > 0) {
            // Cannot acquire exclusive deletion lease while references or other deletion leases exist
            return false;
          }
        }

        // Clean up expired rows for this path
        db.prepare(`
          DELETE FROM file_coordination_leases
          WHERE file_path = ? AND expires_at <= ?
        `).run(canonical, now.toISOString());

        // Insert exclusive deletion lease
        db.prepare(`
          INSERT INTO file_coordination_leases (file_path, lease_type, locked_by, lease_token, locked_at, expires_at)
          VALUES (?, 'deletion', ?, ?, ?, ?)
          ON CONFLICT(file_path, locked_by) DO UPDATE SET
            lease_type = 'deletion',
            lease_token = excluded.lease_token,
            locked_at = excluded.locked_at,
            expires_at = excluded.expires_at
        `).run(canonical, workerTag, token, now.toISOString(), expiresAt.toISOString());

        return true;
      })();

      if (acquired) {
        this.activeDeletions.add(canonical);
        return true;
      }
      return false;
    } catch {
      this.activeDeletions.add(canonical);
      return true;
    }
  }

  renewDeletionLease(filePath: string, holderId: string, leaseToken?: string, extensionMs: number = 30000): boolean {
    if (!filePath || !holderId) return false;
    const canonical = path.resolve(filePath);
    const now = new Date();
    const newExpiresAt = new Date(now.getTime() + extensionMs).toISOString();

    try {
      this.initTable();
      return db.transaction(() => {
        const existing = db.prepare(`
          SELECT * FROM file_coordination_leases
          WHERE file_path = ? AND locked_by = ?
        `).get(canonical, holderId) as any;

        if (!existing) return false;
        if (leaseToken && existing.lease_token && existing.lease_token !== leaseToken) return false;

        const existingExpiry = new Date(existing.expires_at).getTime();
        if (existingExpiry <= now.getTime()) return false; // Expired lease cannot be renewed
        if (existing.lease_type !== 'deletion') return false;

        db.prepare(`
          UPDATE file_coordination_leases
          SET expires_at = ?, locked_at = ?
          WHERE file_path = ? AND locked_by = ?
        `).run(newExpiresAt, now.toISOString(), canonical, holderId);

        return true;
      })();
    } catch {
      return false;
    }
  }

  releaseDeletionLease(filePath: string, holderId?: string, leaseToken?: string): boolean {
    if (!filePath || typeof filePath !== 'string') return false;
    const canonical = path.resolve(filePath);
    this.activeDeletions.delete(canonical);

    try {
      this.initTable();
      if (holderId && leaseToken) {
        const result = db.prepare(`
          DELETE FROM file_coordination_leases
          WHERE file_path = ? AND locked_by = ? AND (lease_token = ? OR lease_token IS NULL)
        `).run(canonical, holderId, leaseToken);
        return result.changes > 0;
      } else if (holderId) {
        const result = db.prepare('DELETE FROM file_coordination_leases WHERE file_path = ? AND locked_by = ?').run(canonical, holderId);
        return result.changes > 0;
      } else {
        const result = db.prepare("DELETE FROM file_coordination_leases WHERE file_path = ? AND lease_type = 'deletion'").run(canonical);
        return result.changes > 0;
      }
    } catch {
      return false;
    }
  }

  acquireReferenceLease(filePath: string, leaseDurationMs: number = 30000, holderId?: string, leaseToken?: string): boolean {
    if (!filePath || typeof filePath !== 'string') return false;
    const canonical = path.resolve(filePath);
    const workerTag = holderId || `ref_${process.pid}_${Math.random().toString(36).substring(2, 6)}`;
    const token = leaseToken || `tok_ref_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + leaseDurationMs);

    // In-process fast check
    if (this.activeDeletions.has(canonical)) {
      return false;
    }

    try {
      this.initTable();
      // Atomic SQLite transaction for reference lease acquisition
      const acquired = db.transaction(() => {
        // 1. Check if any active unexpired deletion lease exists
        const activeDeletion = db.prepare(`
          SELECT * FROM file_coordination_leases
          WHERE file_path = ? AND lease_type = 'deletion' AND expires_at > ?
        `).get(canonical, now.toISOString()) as any;

        if (activeDeletion) {
          // Deletion in progress -> reference rejected
          return false;
        }

        // Clean up expired rows
        db.prepare(`
          DELETE FROM file_coordination_leases
          WHERE file_path = ? AND expires_at <= ?
        `).run(canonical, now.toISOString());

        // Insert reference lease (coexists with other reference leases for same path)
        db.prepare(`
          INSERT INTO file_coordination_leases (file_path, lease_type, locked_by, lease_token, locked_at, expires_at)
          VALUES (?, 'reference', ?, ?, ?, ?)
          ON CONFLICT(file_path, locked_by) DO UPDATE SET
            lease_type = 'reference',
            lease_token = excluded.lease_token,
            locked_at = excluded.locked_at,
            expires_at = excluded.expires_at
        `).run(canonical, workerTag, token, now.toISOString(), expiresAt.toISOString());

        return true;
      })();

      if (acquired) {
        this.activeReferences.add(canonical);
        return true;
      }
      return false;
    } catch {
      this.activeReferences.add(canonical);
      return true;
    }
  }

  renewReferenceLease(filePath: string, holderId: string, leaseToken?: string, extensionMs: number = 30000): boolean {
    if (!filePath || !holderId) return false;
    const canonical = path.resolve(filePath);
    const now = new Date();
    const newExpiresAt = new Date(now.getTime() + extensionMs).toISOString();

    try {
      this.initTable();
      return db.transaction(() => {
        const existing = db.prepare(`
          SELECT * FROM file_coordination_leases
          WHERE file_path = ? AND locked_by = ?
        `).get(canonical, holderId) as any;

        if (!existing) {
          return false; // Lease missing or already pruned
        }

        if (leaseToken && existing.lease_token && existing.lease_token !== leaseToken) {
          return false; // Stale token mismatch: cannot renew a newer lease
        }

        const existingExpiry = new Date(existing.expires_at).getTime();
        if (existingExpiry <= now.getTime()) {
          // CRITICAL: Expired lease cannot be renewed by a stale process
          return false;
        }

        if (existing.lease_type !== 'reference') {
          return false;
        }

        db.prepare(`
          UPDATE file_coordination_leases
          SET expires_at = ?, locked_at = ?
          WHERE file_path = ? AND locked_by = ?
        `).run(newExpiresAt, now.toISOString(), canonical, holderId);

        return true;
      })();
    } catch {
      return false;
    }
  }

  releaseReferenceLease(filePath: string, holderId?: string, leaseToken?: string): boolean {
    if (!filePath || typeof filePath !== 'string') return false;
    const canonical = path.resolve(filePath);
    this.activeReferences.delete(canonical);

    try {
      this.initTable();
      if (holderId && leaseToken) {
        const result = db.prepare(`
          DELETE FROM file_coordination_leases
          WHERE file_path = ? AND locked_by = ? AND (lease_token = ? OR lease_token IS NULL)
        `).run(canonical, holderId, leaseToken);
        return result.changes > 0;
      } else if (holderId) {
        const result = db.prepare('DELETE FROM file_coordination_leases WHERE file_path = ? AND locked_by = ?').run(canonical, holderId);
        return result.changes > 0;
      } else {
        const result = db.prepare("DELETE FROM file_coordination_leases WHERE file_path = ? AND lease_type = 'reference'").run(canonical);
        return result.changes > 0;
      }
    } catch {
      return false;
    }
  }

  assertReferenceLeaseValid(filePath: string, holderId: string, leaseToken?: string): void {
    if (!filePath || !holderId) {
      throw new Error('Concurrency Conflict: filePath and holderId are required to validate reference lease.');
    }
    const canonical = path.resolve(filePath);
    this.initTable();
    const row = db.prepare(`
      SELECT * FROM file_coordination_leases
      WHERE file_path = ? AND locked_by = ?
    `).get(canonical, holderId) as any;

    if (!row) {
      throw new Error(`Concurrency Conflict: Reference lease for '${path.basename(filePath)}' does not exist or was lost. Database operation aborted.`);
    }

    if (leaseToken && row.lease_token && row.lease_token !== leaseToken) {
      throw new Error(`Concurrency Conflict: Stale lease token for '${path.basename(filePath)}'. Database operation aborted.`);
    }

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      throw new Error(`Concurrency Conflict: Reference lease for '${path.basename(filePath)}' has expired. Database operation aborted.`);
    }

    if (row.lease_type !== 'reference') {
      throw new Error(`Concurrency Conflict: Lease for '${path.basename(filePath)}' is not a reference lease.`);
    }
  }

  createLeaseHeartbeat(
    filePath: string,
    holderId: string,
    leaseToken: string,
    intervalMs: number = 8000,
    extensionMs: number = 30000
  ): {
    stop: () => void;
    hasFailed: () => boolean;
    getFailureReason: () => string | null;
    assertValid: () => void;
  } {
    let failed = false;
    let failureReason: string | null = null;
    const coordinator = this;

    const timer = setInterval(() => {
      if (failed) return;
      const renewed = coordinator.renewReferenceLease(filePath, holderId, leaseToken, extensionMs);
      if (!renewed) {
        failed = true;
        failureReason = `Heartbeat renewal failed: Reference lease for '${path.basename(filePath)}' could not be renewed (expired, stale token, or stolen).`;
        clearInterval(timer);
      }
    }, intervalMs);

    if (timer.unref) timer.unref();

    return {
      stop: () => {
        clearInterval(timer);
      },
      hasFailed: () => failed,
      getFailureReason: () => failureReason,
      assertValid: () => {
        if (failed) {
          throw new Error(`Concurrency Conflict: ${failureReason}`);
        }
        coordinator.assertReferenceLeaseValid(filePath, holderId, leaseToken);
      }
    };
  }

  assertDeletionLeaseValid(filePath: string, holderId: string, leaseToken?: string): void {
    if (!filePath || !holderId) {
      throw new Error('Concurrency Conflict: filePath and holderId are required to validate deletion lease.');
    }
    const canonical = path.resolve(filePath);
    this.initTable();
    const row = db.prepare(`
      SELECT * FROM file_coordination_leases
      WHERE file_path = ? AND locked_by = ?
    `).get(canonical, holderId) as any;

    if (!row) {
      throw new Error(`Concurrency Conflict: Deletion lease for '${path.basename(filePath)}' does not exist or was lost. Physical file deletion aborted.`);
    }

    if (leaseToken && row.lease_token && row.lease_token !== leaseToken) {
      throw new Error(`Concurrency Conflict: Stale lease token for '${path.basename(filePath)}'. Physical file deletion aborted.`);
    }

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      throw new Error(`Concurrency Conflict: Deletion lease for '${path.basename(filePath)}' has expired. Physical file deletion aborted.`);
    }

    if (row.lease_type !== 'deletion') {
      throw new Error(`Concurrency Conflict: Lease for '${path.basename(filePath)}' is not a deletion lease.`);
    }

    // Critical Invariant: Ensure no active unexpired reference lease exists for this path
    const nowIso = new Date().toISOString();
    const activeRef = db.prepare(`
      SELECT locked_by FROM file_coordination_leases
      WHERE file_path = ? AND lease_type = 'reference' AND (expires_at > ? OR expires_at > CURRENT_TIMESTAMP)
    `).get(canonical, nowIso) as any;

    if (activeRef) {
      throw new Error(`Concurrency Conflict: Active reference lease held by '${activeRef.locked_by}' for '${path.basename(filePath)}'. Physical file deletion blocked.`);
    }
  }

  createDeletionHeartbeat(
    filePath: string,
    holderId: string,
    leaseToken: string,
    intervalMs: number = 8000,
    extensionMs: number = 30000
  ): {
    stop: () => void;
    hasFailed: () => boolean;
    getFailureReason: () => string | null;
    assertValid: () => void;
  } {
    let failed = false;
    let failureReason: string | null = null;
    const coordinator = this;

    const timer = setInterval(() => {
      if (failed) return;
      const renewed = coordinator.renewDeletionLease(filePath, holderId, leaseToken, extensionMs);
      if (!renewed) {
        failed = true;
        failureReason = `Heartbeat renewal failed: Deletion lease for '${path.basename(filePath)}' could not be renewed (expired, stale token, or stolen).`;
        clearInterval(timer);
      }
    }, intervalMs);

    if (timer.unref) timer.unref();

    return {
      stop: () => {
        clearInterval(timer);
      },
      hasFailed: () => failed,
      getFailureReason: () => failureReason,
      assertValid: () => {
        if (failed) {
          throw new Error(`Concurrency Conflict: ${failureReason}`);
        }
        coordinator.assertDeletionLeaseValid(filePath, holderId, leaseToken);
      }
    };
  }

  assertCanReferenceFile(filePath: string): void {
    if (!filePath || typeof filePath !== 'string') return;
    const canonical = path.resolve(filePath);
    if (this.isPathDeleting(canonical)) {
      throw new Error(
        `Concurrency Conflict: File '${path.basename(filePath)}' is actively undergoing deletion by another operation. Reference rejected.`
      );
    }
  }
}

export const fileLockCoordinator = new FileDeletionLockCoordinator();

/**
 * Safely and coordinately deletes a persistent upload file adhering to strict release gate invariants:
 * 1. Validates canonical path containment within allowedUploadsDir (no directory traversal).
 * 2. Inspects physical filesystem state (handles missing files gracefully, blocks directories).
 * 3. Acquires an exclusive cross-process deletion lease via SQLite (`file_coordination_leases`).
 * 4. Maintains active heartbeat renewal during operation to prevent premature TTL expiration.
 * 5. Strictly validates lease validity, fencing token, and absence of active reference leases.
 * 6. Rechecks database references across ALL tenants while holding the exclusive deletion lease.
 * 7. Safely handles symlinks (verifies target containment; unlinks only symlink pointer).
 * 8. Asserts fencing token validity immediately before physical unlinking.
 * 9. Clears heartbeat timer and releases deletion lease in finally block.
 */
export function safelyDeletePersistentUpload(
  filePath: string,
  options: {
    holderPrefix?: string;
    leaseDurationMs?: number;
    reason?: string;
  } = {}
): {
  success: boolean;
  unlinked: boolean;
  skippedReason?: string;
  error?: string;
} {
  if (!filePath || typeof filePath !== 'string') {
    return { success: false, unlinked: false, error: 'Invalid file path' };
  }

  const allowedUploadsDir = path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), 'data', 'uploads'));
  const canonical = path.resolve(filePath);

  // 1. Path containment security check
  if (!isPathContained(canonical, allowedUploadsDir)) {
    return {
      success: false,
      unlinked: false,
      error: `Security Violation: File path '${filePath}' resolves outside the allowed uploads directory.`
    };
  }

  // 2. Physical filesystem inspection
  let lstat: fs.Stats;
  try {
    lstat = fs.lstatSync(canonical);
  } catch (statErr: any) {
    if (statErr.code === 'ENOENT') {
      return { success: true, unlinked: false, skippedReason: 'File does not exist on disk' };
    }
    return { success: false, unlinked: false, error: statErr.message || 'File access error' };
  }

  if (!lstat.isFile() && !lstat.isSymbolicLink()) {
    return {
      success: false,
      unlinked: false,
      error: `Security Violation: Target '${filePath}' is not a regular file or symbolic link.`
    };
  }

  // 3. Acquire exclusive deletion lease across processes
  const holderPrefix = options.holderPrefix || 'coord_del';
  const holderId = `${holderPrefix}_${process.pid}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const leaseToken = `tok_del_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const leaseDurationMs = options.leaseDurationMs || 30000;

  const acquired = fileLockCoordinator.acquireDeletionLease(canonical, leaseDurationMs, holderId, leaseToken);
  if (!acquired) {
    return {
      success: false,
      unlinked: false,
      skippedReason: `Cannot acquire exclusive deletion lease: file is actively referenced or locked by another operation.`
    };
  }

  // 4. Start heartbeat for deletion lease renewal
  const heartbeat = fileLockCoordinator.createDeletionHeartbeat(canonical, holderId, leaseToken, 8000, leaseDurationMs);

  try {
    // 5. Invariant assertion: verify deletion lease is valid and no reference leases exist
    heartbeat.assertValid();

    // 6. Database reference double-check while holding exclusive lease
    const remaining = db.prepare('SELECT COUNT(*) as count FROM resumes WHERE stored_file_path = ?').get(canonical) as { count: number } | undefined;
    if (remaining && remaining.count > 0) {
      return {
        success: true,
        unlinked: false,
        skippedReason: `File is referenced by ${remaining.count} database resume record(s). Deletion prevented.`
      };
    }

    // Check by filename pattern as extra safeguard
    const baseName = path.basename(canonical);
    const remainingBase = db.prepare('SELECT COUNT(*) as count FROM resumes WHERE stored_file_path = ? OR stored_file_path LIKE ?').get(filePath, `%${baseName}%`) as { count: number } | undefined;
    if (remainingBase && remainingBase.count > 0) {
      return {
        success: true,
        unlinked: false,
        skippedReason: `File is referenced by ${remainingBase.count} database resume record(s). Deletion prevented.`
      };
    }

    // 7. Symlink target validation
    if (lstat.isSymbolicLink()) {
      let realPath: string;
      try {
        realPath = fs.realpathSync(canonical);
      } catch {
        // Dangling symlink: unlink symlink pointer itself safely
        heartbeat.assertValid();
        fs.unlinkSync(canonical);
        return { success: true, unlinked: true };
      }

      if (!isPathContained(realPath, allowedUploadsDir)) {
        return {
          success: false,
          unlinked: false,
          error: `Security Violation: Symlink target for '${filePath}' resolves outside the allowed uploads directory.`
        };
      }

      heartbeat.assertValid();
      fs.unlinkSync(canonical);
      return { success: true, unlinked: true };
    }

    // 8. Final fencing validation immediately before physical unlink
    heartbeat.assertValid();
    fs.unlinkSync(canonical);
    return { success: true, unlinked: true };
  } catch (unlinkErr: any) {
    return {
      success: false,
      unlinked: false,
      error: unlinkErr.message || 'Error occurred during unlinking'
    };
  } finally {
    // 9. Safe disposal of heartbeat and deletion lease
    heartbeat.stop();
    fileLockCoordinator.releaseDeletionLease(canonical, holderId, leaseToken);
  }
}

// Complete user data erasure (Right to Be Forgotten - GDPR Article 17)
export interface WipeUserDataResult {
  success: boolean;
  userId: string;
  filesDeleted: string[];
  fileDeletionErrors: Array<{ path: string; error: string }>;
}

export function wipeAllUserData(userId: string): WipeUserDataResult {
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    throw new Error('Mandatory Parameter Missing: A valid, non-empty userId is required to execute user data erasure.');
  }
  const cleanUserId = userId.trim();

  // 1. Inspect existing tables in the database schema to distinguish absent optional tables from unexpected SQL errors
  const existingTables = new Set(
    (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(r => r.name)
  );

  // Collect user-owned file paths prior to database record deletion
  let candidateFiles: string[] = [];
  if (existingTables.has('resumes')) {
    const resumeRows = db.prepare('SELECT stored_file_path FROM resumes WHERE user_id = ?').all(cleanUserId) as { stored_file_path?: string }[];
    candidateFiles = resumeRows.map(r => r.stored_file_path).filter((p): p is string => Boolean(p && typeof p === 'string'));
  }

  // Pre-filter: verify file is not shared or referenced by another user's resume
  const filesToDelete: string[] = [];
  if (existingTables.has('resumes')) {
    for (const filePath of candidateFiles) {
      const shared = db.prepare('SELECT COUNT(*) as count FROM resumes WHERE stored_file_path = ? AND user_id != ?').get(filePath, cleanUserId) as { count: number };
      if (!shared || shared.count === 0) {
        filesToDelete.push(filePath);
      }
    }
  } else {
    filesToDelete.push(...candidateFiles);
  }

  function deleteFromTable(table: string, query: string, ...params: any[]) {
    if (existingTables.has(table)) {
      // Do NOT swallow unexpected SQL execution errors; any error must abort the transaction
      db.prepare(query).run(...params);
    }
  }

  // 2. Atomic database deletion across all user-owned tables.
  // Any unexpected SQL error will abort the transaction and roll back all changes.
  db.transaction(() => {
    // Child and dependent records deleted first in foreign-key dependency order
    deleteFromTable('search_history', 'DELETE FROM search_history WHERE user_id = ?', cleanUserId);
    deleteFromTable('saved_opportunities', 'DELETE FROM saved_opportunities WHERE user_id = ?', cleanUserId);
    deleteFromTable('cv_evaluations', 'DELETE FROM cv_evaluations WHERE user_id = ?', cleanUserId);
    deleteFromTable('company_portal_accounts', 'DELETE FROM company_portal_accounts WHERE user_id = ?', cleanUserId);
    deleteFromTable('integrations', 'DELETE FROM integrations WHERE user_id = ?', cleanUserId);
    deleteFromTable('linkedin_messages', 'DELETE FROM linkedin_messages WHERE user_id = ?', cleanUserId);
    deleteFromTable('sessions', 'DELETE FROM sessions WHERE user_id = ?', cleanUserId);
    deleteFromTable('password_reset_tokens', 'DELETE FROM password_reset_tokens WHERE user_id = ?', cleanUserId);
    deleteFromTable('user_settings', 'DELETE FROM user_settings WHERE user_id = ?', cleanUserId);
    // Dependent emails: strictly delete emails belonging to user's applications,
    // or unlinked emails where user was sender/recipient, ensuring other users' applications are never affected
    deleteFromTable(
      'emails',
      `DELETE FROM emails
       WHERE application_id IN (SELECT id FROM applications WHERE user_id = ?)
          OR (application_id IS NULL AND (recipient = (SELECT email FROM users WHERE id = ?) OR sender = (SELECT email FROM users WHERE id = ?)))`,
      cleanUserId, cleanUserId, cleanUserId
    );
    deleteFromTable('applications', 'DELETE FROM applications WHERE user_id = ?', cleanUserId);
    deleteFromTable(
      'extracted_profiles',
      'DELETE FROM extracted_profiles WHERE resume_id IN (SELECT id FROM resumes WHERE user_id = ?)',
      cleanUserId
    );
    deleteFromTable('resumes', 'DELETE FROM resumes WHERE user_id = ?', cleanUserId);
    deleteFromTable('profile_permissions', 'DELETE FROM profile_permissions WHERE user_id = ?', cleanUserId);
    deleteFromTable('profile_locations', 'DELETE FROM profile_locations WHERE user_id = ?', cleanUserId);
    deleteFromTable('profiles', 'DELETE FROM profiles WHERE user_id = ?', cleanUserId);
    deleteFromTable('audit_logs', 'DELETE FROM audit_logs WHERE user_id = ?', cleanUserId);
    deleteFromTable('users', 'DELETE FROM users WHERE id = ?', cleanUserId);
  })();

  // 3. Post-transaction physical file deletion (executed ONLY after database transaction has committed)
  // Strictly restricted to the dedicated uploads directory; arbitrary deletion elsewhere inside data/ is prohibited
  const allowedUploadsDir = path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), 'data', 'uploads'));
  const filesDeleted: string[] = [];
  const fileDeletionErrors: Array<{ path: string; error: string }> = [];

  for (const filePath of filesToDelete) {
    const result = safelyDeletePersistentUpload(filePath, {
      holderPrefix: `wipe_${cleanUserId}`,
      reason: 'GDPR user data erasure'
    });
    if (result.unlinked) {
      filesDeleted.push(filePath);
    } else if (result.error && !result.skippedReason) {
      fileDeletionErrors.push({
        path: filePath,
        error: result.error
      });
    }
  }

  // 4. Audit logging and recoverable error recording
  if (fileDeletionErrors.length > 0) {
    logAudit('USER_DATA_ERASURE_PARTIAL_FILE_CLEANUP', {
      user_id: cleanUserId,
      deleted_count: filesDeleted.length,
      failed_count: fileDeletionErrors.length,
      errors: fileDeletionErrors
    });
  } else {
    logAudit('USER_DATA_ERASED', { user_id: cleanUserId, files_deleted: filesDeleted.length });
  }

  return {
    success: true,
    userId: cleanUserId,
    filesDeleted,
    fileDeletionErrors
  };
}

/**
 * Recovers and safely cleans up orphaned physical files in the uploads directory
 * that were created by crashed upload processes before committing a resume record.
 *
 * Guarantees:
 * 1. Files with an active unexpired reference or deletion lease are NEVER touched.
 * 2. Files referenced by ANY resume record in the database are NEVER touched.
 * 3. Recent files (younger than olderThanMs) are NEVER touched to protect in-flight uploads.
 * 4. Acquires an exclusive deletion lease before unlinking to coordinate with concurrent processes.
 */
export function cleanupOrphanedUploadFiles(olderThanMs: number = 300000): {
  success: boolean;
  cleanedFiles: string[];
  skippedCount: number;
} {
  const allowedUploadsDir = path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), 'data', 'uploads'));
  if (!fs.existsSync(allowedUploadsDir)) {
    return { success: true, cleanedFiles: [], skippedCount: 0 };
  }

  const cleanedFiles: string[] = [];
  let skippedCount = 0;
  const now = Date.now();
  const entries = fs.readdirSync(allowedUploadsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;
    const fullPath = path.join(allowedUploadsDir, entry.name);
    const canonical = path.resolve(fullPath);

    if (!isPathContained(canonical, allowedUploadsDir)) {
      skippedCount++;
      continue;
    }

    try {
      const stat = fs.lstatSync(canonical);
      // Skip files younger than olderThanMs to protect in-flight processes
      if (now - stat.mtimeMs < olderThanMs) {
        skippedCount++;
        continue;
      }

      // Skip files with active leases
      if (fileLockCoordinator.isPathReferenced(canonical) || fileLockCoordinator.isPathDeleting(canonical)) {
        skippedCount++;
        continue;
      }

      // Check if referenced by ANY resume in the database
      const refCount = db.prepare('SELECT COUNT(*) as count FROM resumes WHERE stored_file_path = ?').get(canonical) as { count: number } | undefined;
      if (refCount && refCount.count > 0) {
        skippedCount++;
        continue;
      }

      // Also check if referenced by relative/filename pattern
      const refName = db.prepare('SELECT COUNT(*) as count FROM resumes WHERE stored_file_path LIKE ?').get(`%${entry.name}%`) as { count: number } | undefined;
      if (refName && refName.count > 0) {
        skippedCount++;
        continue;
      }

      // Route deletion through coordinated deletion service
      const deleteResult = safelyDeletePersistentUpload(canonical, {
        holderPrefix: 'orphan_cleaner',
        leaseDurationMs: 10000,
        reason: 'Orphaned physical file cleanup'
      });

      if (deleteResult.unlinked) {
        cleanedFiles.push(canonical);
        logAudit('ORPHANED_FILE_CLEANED', { file: canonical, age_ms: now - stat.mtimeMs });
      } else {
        skippedCount++;
      }
    } catch {
      skippedCount++;
    }
  }

  return {
    success: true,
    cleanedFiles,
    skippedCount
  };
}
