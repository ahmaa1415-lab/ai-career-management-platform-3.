/**
 * Staging Security & Guardrails Enforcement
 * Guarantees that staging environments cannot trigger live external side effects.
 */

export function isStagingMode(): boolean {
  return process.env.STAGING_MODE === 'true' || process.env.NODE_ENV === 'staging';
}

export function isRegistrationAllowed(providedCode?: string): boolean {
  if (!isStagingMode()) return true;
  const requiredCode = process.env.STAGING_ACCESS_CODE;
  if (!requiredCode) return true; // If no code set, open for testing
  return providedCode === requiredCode;
}

export function guardExternalSubmission(employer: string, url: string): { blocked: boolean; reason?: string } {
  if (isStagingMode()) {
    console.warn(`[STAGING_SECURITY] Blocked external application submission to ${employer} (${url}). Live submissions disabled in staging mode.`);
    return {
      blocked: true,
      reason: `STAGING_MODE_ACTIVE: Live employer submissions are disabled. Application recorded in staging database only.`
    };
  }
  return { blocked: false };
}

export function guardOutboundEmail(recipient: string, subject: string): { blocked: boolean; mode: 'sandbox' | 'live' } {
  if (isStagingMode()) {
    console.log(`[STAGING_SECURITY] Intercepted outbound email to ${recipient}. Routing to staging sandbox mailbox only.`);
    return { blocked: true, mode: 'sandbox' };
  }
  return { blocked: false, mode: 'live' };
}

export function sanitizeErrorResponse(error: any): { error: string } {
  // In staging and production, never leak internal file paths, stack traces, or SQL queries
  if (process.env.NODE_ENV === 'production' || isStagingMode()) {
    return {
      error: 'An internal error occurred while processing your request. Please contact support.'
    };
  }
  return {
    error: error?.message || 'Unknown server error'
  };
}
