import * as cheerio from 'cheerio';
import { upsertArticle, updateSourceFetchedAt, getRssSources } from './db';
import { categorize, isRelevantArticle } from './categorize';

interface ScrapedArticle {
  guid: string;
  title: string;
  link: string;
  summary: string;
  source_name: string;
  published_at: string;
  category: string;
  image_url: string | null;
}

function parseJapaneseDate(dateStr: string, year?: number): string {
  // Handle "2026年3月12日" format
  const fullMatch = dateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (fullMatch) {
    const [, y, m, d] = fullMatch;
    return new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`).toISOString();
  }

  // Handle "3月13日" format (month/day only)
  const shortMatch = dateStr.match(/(\d{1,2})月(\d{1,2})日/);
  if (shortMatch && year) {
    const [, m, d] = shortMatch;
    return new Date(`${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`).toISOString();
  }

  return new Date().toISOString();
}

// 日本の会計年度: 4月始まり
function currentFiscalYear(): number {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  return month >= 4 ? now.getFullYear() : now.getFullYear() - 1;
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buffer = await res.arrayBuffer();
  // Most Japanese gov sites use UTF-8 or Shift-JIS; try UTF-8 first
  return new TextDecoder('utf-8').decode(buffer);
}

async function scrapeBunkacho(): Promise<ScrapedArticle[]> {
  const BASE_URL = 'https://www.bunka.go.jp';
  const URL = `${BASE_URL}/koho_hodo_oshirase/hodohappyo/`;
  const html = await fetchHtml(URL);
  const $ = cheerio.load(html);
  const articles: ScrapedArticle[] = [];

  $('ul.news_list_tag li').each((_, el) => {
    const dateText = $(el).find('p.news_list_date').text().trim();
    const anchor = $(el).find('p.news_list_ttl a');
    const title = anchor.text().trim();
    const href = anchor.attr('href');

    if (!title || !href) return;

    const link = href.startsWith('http') ? href : `${BASE_URL}${href}`;
    const published_at = parseJapaneseDate(dateText);
    const guid = link;
    const category = categorize(title);

    articles.push({
      guid,
      title,
      link,
      summary: '',
      source_name: '文化庁',
      published_at,
      category,
      image_url: null,
    });
  });

  return articles;
}

async function scrapeJpf(): Promise<ScrapedArticle[]> {
  const BASE_URL = 'https://www.jpf.go.jp';
  const fiscalYear = currentFiscalYear();
  const URL = `${BASE_URL}/j/about/press/${fiscalYear}/`;
  const html = await fetchHtml(URL);
  const $ = cheerio.load(html);
  const articles: ScrapedArticle[] = [];

  $('table tr').each((_, row) => {
    const ths = $(row).find('th');
    const td = $(row).find('td');
    if (ths.length < 2 || !td.length) return;

    const dateText = ths.eq(1).text().trim(); // "3月13日"
    const anchor = td.find('a');
    const title = anchor.text().trim();
    const href = anchor.attr('href');

    if (!title || !href) return;

    // Determine calendar year from fiscal year and month
    const monthMatch = dateText.match(/(\d{1,2})月/);
    const month = monthMatch ? parseInt(monthMatch[1]) : 4;
    // 4月〜12月 → 会計年度の開始年、1月〜3月 → 翌年
    const calYear = month >= 4 ? fiscalYear : fiscalYear + 1;

    const link = href.startsWith('http') ? href : `${BASE_URL}${href}`;
    const published_at = parseJapaneseDate(dateText, calYear);
    const guid = link;
    const category = categorize(title);

    articles.push({
      guid,
      title,
      link,
      summary: '',
      source_name: '国際交流基金',
      published_at,
      category,
      image_url: null,
    });
  });

  return articles;
}

export async function fetchAllScrapedSources(): Promise<void> {
  const scrapers: Array<{ name: string; fn: () => Promise<ScrapedArticle[]> }> = [
    { name: '文化庁', fn: scrapeBunkacho },
    { name: '国際交流基金', fn: scrapeJpf },
  ];

  for (const { name, fn } of scrapers) {
    try {
      console.log(`[Scraper] Scraping: ${name}`);
      const articles = await fn();
      let count = 0;
      for (const article of articles) {
        if (!isRelevantArticle(article.title, article.source_name)) continue;
        try {
          upsertArticle(article);
          count++;
        } catch (err) {
          console.error(`[Scraper] Failed to upsert: ${article.title}`, err);
        }
      }
      console.log(`[Scraper] ${name}: ${count} articles processed`);

      // Find matching source in DB and update last_fetched_at
      const sources = getRssSources();
      const source = sources.find((s) => s.name === name);
      if (source) updateSourceFetchedAt(source.id);
    } catch (err) {
      console.error(
        `[Scraper] Error scraping ${name}:`,
        err instanceof Error ? err.message : err
      );
    }
  }
}
