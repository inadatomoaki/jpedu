import { NextResponse } from 'next/server';
import { fetchAllFeeds } from '@/lib/rss';

export const dynamic = 'force-dynamic';

let isRefreshing = false;

export async function POST() {
  if (isRefreshing) {
    return NextResponse.json(
      { message: '現在更新中です。しばらくお待ちください。' },
      { status: 429 }
    );
  }

  try {
    isRefreshing = true;
    await fetchAllFeeds();
    return NextResponse.json({ success: true, message: 'RSSフィードを更新しました' });
  } catch (err) {
    console.error('[API /refresh] Error:', err);
    return NextResponse.json(
      { error: 'RSSフィードの取得に失敗しました', details: String(err) },
      { status: 500 }
    );
  } finally {
    isRefreshing = false;
  }
}
