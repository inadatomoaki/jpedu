import { NextRequest, NextResponse } from 'next/server';
import { getEvents, getEventOrganizers } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const upcomingParam = searchParams.get('upcoming');
    const organizer = searchParams.get('organizer') || undefined;

    const upcoming = upcomingParam !== 'false';

    const [events, organizers] = await Promise.all([
      getEvents({ upcoming, organizer }),
      getEventOrganizers(),
    ]);

    return NextResponse.json({ events, organizers });
  } catch (err) {
    console.error('[API /events] Error:', err);
    return NextResponse.json({ error: 'イベント取得に失敗しました' }, { status: 500 });
  }
}
