import { NextResponse } from 'next/server';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    // Active dependency probe: verify SQLite engine is operational and readable
    const probe = db.prepare('SELECT 1 as ok').get() as { ok: number } | undefined;
    if (!probe || probe.ok !== 1) {
      throw new Error('Database ping failed');
    }

    const envLabel = process.env.STAGING_MODE === 'true'
      ? 'staging'
      : (process.env.NODE_ENV || 'production');

    return NextResponse.json({
      status: 'healthy',
      environment: envLabel,
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    }, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Content-Type': 'application/json'
      }
    });
  } catch (err: any) {
    // Sanitized 503 response without leaking paths, secrets, or internal stack traces
    return NextResponse.json({
      status: 'unhealthy',
      reason: 'Critical dependency probe failed',
      timestamp: new Date().toISOString()
    }, {
      status: 503,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Content-Type': 'application/json'
      }
    });
  }
}
