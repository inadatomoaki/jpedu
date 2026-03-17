import Parser from 'rss-parser';
import { getRssSources, upsertArticle, updateSourceFetchedAt } from './db';
import { categorize, isRelevantArticle } from './categorize';
import { fetchAllScrapedSources } from './scraper';
import { fetchOgImagesInBackground } from './og';

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'JPEduPortal/1.0 (Japanese Language Education News Aggregator)',
    Accept: 'application/rss+xml, application/xml, text/xml, */*',
  },
  customFields: {
    item: [
      ['content:encoded', 'contentEncoded'],
      ['description', 'description'],
      ['media:content', 'mediaContent'],
      ['media:thumbnail', 'mediaThumbnail'],
    ],
  },
});

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text: string, maxLength = 200): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '…';
}

function makeGuid(sourceUrl: string, item: { link?: string; guid?: string; title?: string }): string {
  return item.guid || item.link || `${sourceUrl}::${item.title || Date.now()}`;
}

function extractImageUrl(item: {
  enclosure?: { url?: string; type?: string };
  mediaContent?: { $?: { url?: string } } | { $?: { url?: string } }[];
  mediaThumbnail?: { $?: { url?: string } };
  description?: string;
  content?: string;
  contentEncoded?: string;
}): string | null {
  // enclosure
  if (item.enclosure?.url && item.enclosure.type?.startsWith('image/')) {
    return item.enclosure.url;
  }
  // media:content
  const mc = Array.isArray(item.mediaContent) ? item.mediaContent[0] : item.mediaContent;
  if (mc?.$?.url) return mc.$.url;
  // media:thumbnail
  if (item.mediaThumbnail?.$?.url) return item.mediaThumbnail.$.url;
  // <img> in HTML description/content
  const html = item.description || item.content || item.contentEncoded || '';
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (match) return match[1];
  return null;
}

function isRssFeed(url: string): boolean {
  return /\.(rdf|xml|rss|atom)$/.test(url) || /\/(rss|feed|atom)(\/|$)/.test(url);
}

export async function fetchAllFeeds(): Promise<void> {
  const sources = getRssSources();
  const rssOnly = sources.filter((s) => isRssFeed(s.url));
  console.log(`[RSS] Fetching ${rssOnly.length} RSS feeds...`);

  for (const source of rssOnly) {
    try {
      console.log(`[RSS] Fetching: ${source.name} (${source.url})`);
      // fetch()でHTMLを取得してからparseString()で解析（URL文字コード問題を回避）
      const res = await fetch(source.url, {
        headers: {
          'User-Agent': 'JPEduPortal/1.0 (Japanese Language Education News Aggregator)',
          Accept: 'application/rss+xml, application/xml, text/xml, */*',
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`Status code ${res.status}`);
      const xml = await res.text();
      const feed = await parser.parseString(xml);

      let insertedCount = 0;
      for (const item of feed.items || []) {
        const rawText = [item.title, item.contentSnippet || item.content || ''].join(' ');
        const summary = truncate(
          stripHtml(item.contentSnippet || item.content || item.description || '')
        );
        const category = categorize(rawText);
        const publishedAt = item.pubDate
          ? new Date(item.pubDate).toISOString()
          : new Date().toISOString();

        const title = item.title || '(タイトルなし)';
        if (!isRelevantArticle(title, source.name)) continue;
        const image_url = extractImageUrl(item);
        try {
          upsertArticle({
            guid: makeGuid(source.url, item),
            title,
            link: item.link || source.url,
            summary,
            source_name: source.name,
            published_at: publishedAt,
            category,
            image_url,
          });
          insertedCount++;
        } catch (err) {
          console.error(`[RSS] Failed to upsert article: ${item.title}`, err);
        }
      }

      updateSourceFetchedAt(source.id);
      console.log(`[RSS] ${source.name}: ${insertedCount} articles processed`);
    } catch (err) {
      // Log per-source errors but continue with other sources
      console.error(`[RSS] Error fetching ${source.name} (${source.url}):`, err instanceof Error ? err.message : err);
    }
  }

  console.log('[RSS] Done fetching RSS feeds');

  // スクレイピングソースを取得
  await fetchAllScrapedSources();

  console.log('[RSS] All sources done');

  // OG画像をバックグラウンドで取得（未取得記事を最大30件）
  fetchOgImagesInBackground(30);
}
