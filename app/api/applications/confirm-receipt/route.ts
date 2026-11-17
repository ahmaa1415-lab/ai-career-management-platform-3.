import { NextResponse } from 'next/server';
import { recordEmployerConfirmation } from '@/lib/applications/workflow';

import { getAuthenticatedUser } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    const user = authUser;

    const body = await req.json();
    const { application_id, confirmation_reference, evidence_type, notes } = body;

    if (!application_id) {
      return NextResponse.json({ error: 'application_id is required' }, { status: 400 });
    }

    if (!confirmation_reference || !confirmation_reference.trim()) {
      return NextResponse.json({
        error: 'Confirmation reference or evidence ID is mandatory to record verified employer confirmation.'
      }, { status: 400 });
    }

    // Candidates can submit self-reported evidence (receipt, screenshot, email),
    // but cannot spoof automated system/webhook independent verification
    const candidateAllowedTypes = ['candidate_receipt', 'portal_screenshot', 'reception_email'];
    const chosenType = candidateAllowedTypes.includes(evidence_type) ? evidence_type : 'candidate_receipt';

    const app = recordEmployerConfirmation(application_id, user.id, {
      evidence_type: chosenType as any,
      confirmation_reference: confirmation_reference.trim(),
      notes,
      verified_by_system: false
    });

    return NextResponse.json({ success: true, application: app });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
