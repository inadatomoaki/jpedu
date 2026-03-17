import { NextRequest, NextResponse } from 'next/server';
import { markArticleAsRead } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: '無効なIDです' }, { status: 400 });
    }

    await markArticleAsRead(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[API /articles/[id]/read] Error:', err);
    return NextResponse.json(
      { error: '更新に失敗しました', details: String(err) },
      { status: 500 }
    );
  }
}
