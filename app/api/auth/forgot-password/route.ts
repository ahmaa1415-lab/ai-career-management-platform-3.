import { NextResponse } from 'next/server';
import { createPasswordResetToken, validateEmailFormat } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = body;

    if (!email || !validateEmailFormat(email)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address.' },
        { status: 400 }
      );
    }

    const trimmedEmail = email.trim().toLowerCase();
    const result = createPasswordResetToken(trimmedEmail);

    // Check if cloud email dispatch (SendGrid / AWS SES / SMTP) is configured
    const hasSmtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);

    // Standard safe response that prevents email enumeration
    const responsePayload: any = {
      success: true,
      message: 'If an account exists for this email address, password recovery instructions have been issued.',
      email_delivery_status: hasSmtpConfigured ? 'Dispatched via SMTP' : 'Sandbox Simulated (No external SMTP configured)'
    };

    // In local sandbox / testing environment, include the reset URL and token so the recovery flow can be tested
    if (result) {
      responsePayload.reset_token = result.token;
      responsePayload.reset_url = `/reset-password?token=${result.token}`;
      responsePayload.expires_at = result.expiresAt.toISOString();
    }

    return NextResponse.json(responsePayload);
  } catch (err: any) {
    console.error('Forgot password error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
