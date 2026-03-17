import { getDb } from './db';

// GoogleのCDN・ドメインから配信される画像は記事画像ではないためスキップ
const SKIP_IMAGE_DOMAINS = ['lh3.googleusercontent.com', 'news.google.com', 'google.com'];

function isGoogleImage(url: string): boolean {
  try {
    return SKIP_IMAGE_DOMAINS.some((d) => new URL(url).hostname.endsWith(d));
  } catch {
    return false;
  }
}

async function fetchOgImageUrl(articleUrl: string): Promise<string | null> {
  // Google NewsのURLはJSリダイレクトのためOG画像取得不可、スキップ
  if (articleUrl.includes('news.google.com')) return null;

  try {
    const res = await fetch(articleUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    // フェッチ後もGoogleドメインに留まっている場合はスキップ
    if (new URL(res.url).hostname.includes('google.com')) return null;

    const html = await res.text();
    let match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (!match) match = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (!match) match = html.match(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i);
    const imageUrl = match ? match[1] : null;
    // Googleの画像はスキップ
    if (imageUrl && isGoogleImage(imageUrl)) return null;
    return imageUrl;
  } catch {
    return null;
  }
}

// リフレッシュ後にバックグラウンドでOG画像を取得・キャッシュする
// image_url が NULL の記事を対象に batchSize 件取得する
export function fetchOgImagesInBackground(batchSize = 30): void {
  const db = getDb();
  const articles = db.prepare(
    'SELECT id, link FROM articles WHERE image_url IS NULL ORDER BY published_at DESC LIMIT ?'
  ).all(batchSize) as { id: number; link: string }[];

  if (articles.length === 0) return;
  console.log(`[OG] Fetching OG images for ${articles.length} articles (background)...`);

  const CONCURRENCY = 5;
  (async () => {
    for (let i = 0; i < articles.length; i += CONCURRENCY) {
      const batch = articles.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (article) => {
          const imageUrl = await fetchOgImageUrl(article.link);
          // 空文字列を「試したが画像なし」のセンチネルとして保存し、再取得を防ぐ
          db.prepare('UPDATE articles SET image_url = ? WHERE id = ?')
            .run(imageUrl ?? '', article.id);
        })
      );
    }
    console.log('[OG] Background OG image fetch done');
  })().catch((err) => console.error('[OG] Error:', err));
}
