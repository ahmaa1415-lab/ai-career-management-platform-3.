import { NextResponse } from 'next/server';
import { getAllApplications, updateApplicationStatus, exportCRMDataAsCSV, exportCRMDataAsJSON, PipelineStage } from '@/lib/crm/pipeline';
import { getAuthenticatedUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    const user = authUser;
    const { searchParams } = new URL(req.url);
    const filter = searchParams.get('status') || undefined;
    const search = searchParams.get('search') || undefined;
    const exportFormat = searchParams.get('export');

    if (exportFormat === 'csv') {
      const csv = exportCRMDataAsCSV(user.id);
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="career_applications.csv"',
        },
      });
    }

    if (exportFormat === 'json') {
      const json = exportCRMDataAsJSON(user.id);
      return new Response(json, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="career_applications.json"',
        },
      });
    }

    const applications = getAllApplications(user.id, filter, search);
    return NextResponse.json({ applications }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    const user = authUser;
    const body = await req.json();
    const { application_id, new_status, notes } = body;

    if (!application_id || !new_status) {
      return NextResponse.json({ error: 'application_id and new_status are required' }, { status: 400 });
    }

    const updated = updateApplicationStatus(application_id, new_status as PipelineStage, notes, user.id);
    return NextResponse.json({ success: true, application: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
