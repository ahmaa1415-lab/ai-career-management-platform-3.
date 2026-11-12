import db, { logAudit } from './db';

export type IntegrationStatus =
  | 'Connected'
  | 'Not Connected'
  | 'Authorization Required'
  | 'Setup Required'
  | 'Expired'
  | 'Reauthorization Required'
  | 'Manual Access'
  | 'External Link Only'
  | 'Temporarily Unavailable'
  | 'Unsupported';

export interface ExternalIntegrationDefinition {
  id: string;
  name: string;
  service: 'google' | 'linkedin' | 'naukrigulf' | 'bayt' | 'wuzzuf';
  category: 'Identity & Communication' | 'Professional Network' | 'Regional GCC & MENA' | 'Egypt & North Africa';
  status: IntegrationStatus;
  auth_type: 'OAuth 2.0 / OpenID' | 'Manual Profile & URL Linking' | 'External Link Only';
  official_auth_available: boolean;
  api_access_available: boolean;
  description: string;
  external_url: string;
  profile_url?: string;
  account_email?: string;
  account_name?: string;
  last_synced_at?: string;
  supported_capabilities: string[];
  unsupported_capabilities: string[];
  required_permissions: string[];
  blockers_or_notes: string;
}

const DEFAULT_INTEGRATIONS_CONFIG: Omit<ExternalIntegrationDefinition, 'status' | 'profile_url' | 'last_synced_at'>[] = [
  {
    id: 'google',
    name: 'Google & Gmail Workspace',
    service: 'google',
    category: 'Identity & Communication',
    auth_type: 'OAuth 2.0 / OpenID',
    official_auth_available: true,
    api_access_available: true,
    description: 'Official Google OAuth 2.0 identity authentication, OpenID Connect profile, and optional Gmail dispatch integration.',
    external_url: 'https://myaccount.google.com',
    supported_capabilities: [
      'Single Sign-On (Google Identity)',
      'Verified Candidate Email Import',
      'Authorized Recruiter Email Sending (via Gmail API with explicit consent)',
      'Account Disconnection & Revocation'
    ],
    unsupported_capabilities: [
      'Automatic inbox scraping without explicit user consent',
      'Third-party credential bypass'
    ],
    required_permissions: [
      'openid (User Identifier)',
      'profile (Full Name & Avatar)',
      'email (Verified Email Address)',
      'https://www.googleapis.com/auth/gmail.send (Optional, Recruiter Outreach only)'
    ],
    blockers_or_notes: 'Requires GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET environment variables for live cloud token exchange.'
  },
  {
    id: 'linkedin',
    name: 'LinkedIn Professional Network',
    service: 'linkedin',
    category: 'Professional Network',
    auth_type: 'OAuth 2.0 / OpenID',
    official_auth_available: true,
    api_access_available: true,
    description: 'Official LinkedIn Sign-In (OpenID Connect), public profile SEO alignment, and public hiring post parser.',
    external_url: 'https://www.linkedin.com',
    supported_capabilities: [
      'Sign In with LinkedIn (OpenID Connect)',
      'Profile Headline & Summary SEO Alignment',
      'Public Hiring Post Parsing & Multi-Role Disaggregation',
      'Recruiter InMail / Post Author Link Attribution',
      'Public Job URL Ingestion'
    ],
    unsupported_capabilities: [
      'LinkedIn Recruiter private enterprise candidate pool access',
      'Automated background bot scraping or CAPTCHA bypass',
      'Private direct message scraping without enterprise partner approval'
    ],
    required_permissions: [
      'openid (Member ID)',
      'profile (Name, Vanity Name, Picture)',
      'email (Member Email)'
    ],
    blockers_or_notes: 'Direct auto-apply via LinkedIn API is restricted to LinkedIn Enterprise Job Board Partners. Public post parser and manual URL import provided as safe, supported alternatives.'
  },
  {
    id: 'naukrigulf',
    name: 'Naukrigulf (Gulf & GCC Careers)',
    service: 'naukrigulf',
    category: 'Regional GCC & MENA',
    auth_type: 'Manual Profile & URL Linking',
    official_auth_available: false,
    api_access_available: false,
    description: 'Premier GCC & Gulf recruitment platform for UAE and Saudi Arabia commercial opportunities.',
    external_url: 'https://www.naukrigulf.com',
    supported_capabilities: [
      'Open Naukrigulf in secure external tab',
      'Store & verify public candidate profile URL',
      'Manual vacancy URL import & 8-criterion match evaluation',
      'Application tracking & status progression in CRM',
      'Direct link attribution to original Naukrigulf vacancy'
    ],
    unsupported_capabilities: [
      'Third-party OAuth consumer login (Naukrigulf does not publish open public consumer OAuth APIs)',
      'Password-based background automated browser scraping'
    ],
    required_permissions: [
      'User-provided public profile URL',
      'User-submitted vacancy URLs'
    ],
    blockers_or_notes: 'Naukrigulf does not provide a public third-party OAuth consumer API. System operates via verified manual workflow and external URL attribution without collecting passwords.'
  },
  {
    id: 'bayt',
    name: 'Bayt.com (Middle East & North Africa)',
    service: 'bayt',
    category: 'Regional GCC & MENA',
    auth_type: 'Manual Profile & URL Linking',
    official_auth_available: false,
    api_access_available: false,
    description: 'Leading Middle East recruitment portal across UAE, Saudi Arabia, and Egypt.',
    external_url: 'https://www.bayt.com',
    supported_capabilities: [
      'Open Bayt.com in secure external tab',
      'Store verified candidate Bayt profile URL',
      'Manual vacancy URL import with automated metadata extraction',
      'Application lifecycle tracking in CRM',
      'Source attribution preservation'
    ],
    unsupported_capabilities: [
      'Third-party OAuth login (Bayt does not provide open consumer OAuth endpoints)',
      'Unauthorized web scraping bypassing anti-bot protection'
    ],
    required_permissions: [
      'User-provided Bayt public profile URL',
      'User-submitted job listing URLs'
    ],
    blockers_or_notes: 'Bayt does not provide an open public consumer OAuth integration. Verified manual profile and job import workflow provided with source tracking.'
  },
  {
    id: 'wuzzuf',
    name: 'WUZZUF (Egypt & Regional FMCG Hub)',
    service: 'wuzzuf',
    category: 'Egypt & North Africa',
    auth_type: 'Manual Profile & URL Linking',
    official_auth_available: false,
    api_access_available: false,
    description: 'Top Egyptian professional recruitment portal for Cairo FMCG, pharmaceuticals, and commercial management.',
    external_url: 'https://wuzzuf.net',
    supported_capabilities: [
      'Open WUZZUF in secure external tab',
      'Store verified candidate WUZZUF profile URL',
      'Manual vacancy URL import and 8-criterion match scoring',
      'Application tracking in CRM',
      'Direct link to original posting'
    ],
    unsupported_capabilities: [
      'Public third-party consumer OAuth API (Wuzzuf does not offer public consumer OAuth)',
      'Automated background bot login'
    ],
    required_permissions: [
      'User-provided WUZZUF profile URL',
      'User-submitted vacancy URLs'
    ],
    blockers_or_notes: 'WUZZUF does not offer a public consumer OAuth API. Verified manual profile linking and job URL import implemented without password collection.'
  }
];

/**
 * Initializes default integrations in SQLite for a user
 */
export function initializeUserIntegrations(userId = 'user_default_01'): void {
  const selectStmt = db.prepare('SELECT service FROM integrations WHERE user_id = ?');
  const existing = selectStmt.all(userId) as { service: string }[];
  const existingServices = new Set(existing.map((e) => e.service));

  const insertStmt = db.prepare(`
    INSERT INTO integrations (
      id, user_id, service, status, profile_url, auth_type, display_name,
      capabilities_json, permissions_json, sync_enabled, metadata, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `);

  for (const def of DEFAULT_INTEGRATIONS_CONFIG) {
    if (!existingServices.has(def.service)) {
      const id = `int_${userId}_${def.service}`;
      let initialStatus: IntegrationStatus = 'Not Connected';
      let profileUrl = '';

      // Check real environment capabilities
      if (def.service === 'google') {
        const hasGoogleCreds = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
        initialStatus = hasGoogleCreds ? 'Not Connected' : 'Setup Required';
      } else if (def.service === 'linkedin') {
        const hasLinkedInCreds = Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
        initialStatus = hasLinkedInCreds ? 'Not Connected' : 'Not Connected';
        profileUrl = '';
      } else {
        // Naukrigulf, Bayt, Wuzzuf have manual access
        initialStatus = 'Manual Access';
        profileUrl = '';
      }

      insertStmt.run(
        id,
        userId,
        def.service,
        initialStatus,
        profileUrl,
        def.auth_type,
        def.name,
        JSON.stringify(def.supported_capabilities),
        JSON.stringify(def.required_permissions),
        JSON.stringify({
          category: def.category,
          official_auth_available: def.official_auth_available,
          api_access_available: def.api_access_available,
          external_url: def.external_url,
          blockers_or_notes: def.blockers_or_notes
        })
      );
    }
  }
}

/**
 * Returns all integrations for a user with merged live status
 */
export function getUserIntegrations(userId = 'user_default_01'): ExternalIntegrationDefinition[] {
  initializeUserIntegrations(userId);

  const stmt = db.prepare('SELECT * FROM integrations WHERE user_id = ?');
  const rows = stmt.all(userId) as any[];
  const rowMap = new Map(rows.map((r) => [r.service, r]));

  return DEFAULT_INTEGRATIONS_CONFIG.map((def) => {
    const row = rowMap.get(def.service);
    const hasGoogleCreds = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    const hasLinkedInCreds = Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);

    let status: IntegrationStatus = (row?.status as IntegrationStatus) || 'Not Connected';

    // Verify actual Google OAuth availability
    if (def.service === 'google' && !hasGoogleCreds && status === 'Not Connected') {
      status = 'Setup Required';
    }

    return {
      ...def,
      status,
      profile_url: row?.profile_url || undefined,
      account_email: row?.account_identifier || undefined,
      account_name: row?.display_name || undefined,
      last_synced_at: row?.last_synced_at || row?.updated_at || undefined,
    };
  });
}

/**
 * Updates an external integration's profile URL or manual details
 */
export function updateIntegrationProfile(
  userId = 'user_default_01',
  service: string,
  profileUrl: string
): { success: boolean; message: string } {
  initializeUserIntegrations(userId);

  const stmt = db.prepare(`
    UPDATE integrations
    SET profile_url = ?, status = 'Manual Access', last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND service = ?
  `);

  const res = stmt.run(profileUrl, userId, service);
  logAudit('INTEGRATION_PROFILE_LINKED', { service, profileUrl }, userId);

  return {
    success: res.changes > 0,
    message: `${service.toUpperCase()} profile URL linked successfully.`
  };
}

/**
 * Disconnects an integration and clears tokens safely
 */
export function disconnectIntegration(userId = 'user_default_01', service: string): { success: boolean; message: string } {
  initializeUserIntegrations(userId);

  const stmt = db.prepare(`
    UPDATE integrations
    SET status = 'Not Connected',
        access_token = NULL,
        client_secret = NULL,
        account_identifier = NULL,
        error_message = NULL,
        last_synced_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND service = ?
  `);

  const res = stmt.run(userId, service);
  logAudit('INTEGRATION_DISCONNECTED', { service }, userId);

  return {
    success: res.changes > 0,
    message: `${service.toUpperCase()} has been disconnected securely.`
  };
}

/**
 * Connects an integration (for simulated or validated credentials)
 */
export function connectIntegration(
  userId = 'user_default_01',
  service: string,
  metadata?: { accountEmail?: string; accountName?: string; profileUrl?: string }
): { success: boolean; message: string } {
  initializeUserIntegrations(userId);

  const stmt = db.prepare(`
    UPDATE integrations
    SET status = 'Connected',
        account_identifier = COALESCE(?, account_identifier),
        display_name = COALESCE(?, display_name),
        profile_url = COALESCE(?, profile_url),
        last_synced_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ? AND service = ?
  `);

  const res = stmt.run(metadata?.accountEmail || null, metadata?.accountName || null, metadata?.profileUrl || null, userId, service);
  logAudit('INTEGRATION_CONNECTED', { service, metadata }, userId);

  return {
    success: res.changes > 0,
    message: `${service.toUpperCase()} connected successfully.`
  };
}
