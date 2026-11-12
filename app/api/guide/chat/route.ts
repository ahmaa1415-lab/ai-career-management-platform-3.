import { NextResponse } from 'next/server';
import { getOrCreateDefaultUser, logAudit } from '@/lib/db';
import { generateGuideResponse } from '@/lib/ai/chatbot-guide';

export async function POST(req: Request) {
  try {
    const user = getOrCreateDefaultUser();
    const body = await req.json();
    const { message, currentPath, history } = body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({
        error: 'Message is required and must be non-empty.'
      }, { status: 400 });
    }

    const result = generateGuideResponse(message, currentPath, history || []);

    // Persist audit log
    try {
      logAudit(
        'AI_GUIDE_CHAT_INTERACTION',
        {
          query_snippet: message.substring(0, 50),
          current_path: currentPath || '/',
          quick_links_count: result.quickLinks.length
        },
        user.id
      );
    } catch (e) {
      // non-fatal for audit
    }

    return NextResponse.json({
      success: true,
      ...result
    });
  } catch (err: any) {
    return NextResponse.json({
      error: err.message || 'Failed to process AI guide request'
    }, { status: 500 });
  }
}
