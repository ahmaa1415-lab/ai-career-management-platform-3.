import { NextResponse } from 'next/server';
import { syncAndDeduplicateJobs } from '@/lib/jobs/aggregator';

export async function POST() {
  try {
    const result = syncAndDeduplicateJobs();
    return NextResponse.json({ success: true, result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
