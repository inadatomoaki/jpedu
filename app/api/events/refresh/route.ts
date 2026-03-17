import { NextResponse } from 'next/server';
import { fetchAllEvents } from '@/lib/events';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    await fetchAllEvents();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[API /events/refresh] Error:', err);
    return NextResponse.json({ error: 'イベント更新に失敗しました' }, { status: 500 });
  }
}
