import { NextRequest, NextResponse } from 'next/server';
import { toggleFavorite } from '@/lib/db';

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

    const is_favorite = await toggleFavorite(id);
    return NextResponse.json({ success: true, is_favorite });
  } catch (err) {
    console.error('[API /articles/[id]/favorite] Error:', err);
    return NextResponse.json(
      { error: '更新に失敗しました', details: String(err) },
      { status: 500 }
    );
  }
}
