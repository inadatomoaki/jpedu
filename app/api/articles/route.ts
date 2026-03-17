import { NextRequest, NextResponse } from 'next/server';
import { getArticles } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || undefined;
    const favorite = searchParams.get('favorite') === 'true';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const result = getArticles({ category, favorite, page, limit });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[API /articles] Error:', err);
    return NextResponse.json(
      { error: 'データの取得に失敗しました', details: String(err) },
      { status: 500 }
    );
  }
}
