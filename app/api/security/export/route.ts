import { NextResponse } from 'next/server';
import { exportCompleteUserData } from '@/lib/security';
import { getOrCreateDefaultUser } from '@/lib/db';

export async function GET() {
  try {
    const user = getOrCreateDefaultUser();
    const data = exportCompleteUserData(user.id);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="candidate_career_data_export.json"',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
