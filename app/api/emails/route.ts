import { NextResponse } from 'next/server';
import { getAllEmails } from '@/lib/email/inbox';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category') || undefined;
    const emails = getAllEmails(category);
    return NextResponse.json({ emails });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
