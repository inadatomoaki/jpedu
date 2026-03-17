import * as cheerio from 'cheerio';
import { upsertEvent } from './db';

interface ScrapedEvent {
  guid: string;
  title: string;
  organizer: string;
  event_type: string;
  event_date: string | null;
  event_date_end: string | null;
  deadline: string | null;
  venue: string | null;
  url: string | null;
  description: string | null;
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,*/*',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buffer = await res.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('shift-jis').decode(buffer);
  }
}

// 日本語日付文字列を YYYY-MM-DD に変換
function parseDate(s: string): string | null {
  if (!s) return null;
  s = s.trim();
  // "2025年6月14日" or "2025年6月14日（土）"
  const jp = s.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (jp) return `${jp[1]}-${jp[2].padStart(2, '0')}-${jp[3].padStart(2, '0')}`;
  // "2025/6/14" "2025-6-14" "2025.6.14"
  const slash = s.match(/(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (slash) return `${slash[1]}-${slash[2].padStart(2, '0')}-${slash[3].padStart(2, '0')}`;
  return null;
}

function inferEventType(title: string): string {
  if (/大会|学術大会|年次大会|年大会/.test(title)) return '大会・学術大会';
  if (/研究会|ワークショップ|セミナー|勉強会/.test(title)) return '研究会・ワークショップ';
  if (/論文|発表|募集|締切|投稿|予稿|応募/.test(title)) return '論文・発表募集';
  if (/講演|シンポジウム|フォーラム|公開講座|講座/.test(title)) return '講演会・シンポジウム';
  if (/試験|検定|JLPT|能力試験/.test(title)) return '試験・検定';
  return 'その他';
}

// 今月から6か月以内かチェック
function isWithin6Months(dateStr: string | null): boolean {
  if (!dateStr) return true; // 日付不明は保存する
  const date = new Date(dateStr);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 6, 0);
  return date >= start && date <= end;
}

// -----------------------------------------------------------------------
// 1. 日本語教育学会 (NKG)
// https://www.nkg.or.jp/event/
// -----------------------------------------------------------------------
async function scrapeNkg(): Promise<ScrapedEvent[]> {
  const BASE = 'https://www.nkg.or.jp';
  const html = await fetchHtml(`${BASE}/event/`);
  const $ = cheerio.load(html);
  const events: ScrapedEvent[] = [];

  // イベントリンク: href="/event/.../..."
  $('a[href*="/event/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (!href.match(/\/event\/.+/)) return;

    const $el = $(el);
    const title = $el.find('h3, h2, .title, strong').first().text().trim() || $el.text().replace(/\s+/g, ' ').trim();
    if (!title || title.length < 4) return;

    const url = href.startsWith('http') ? href : `${BASE}${href}`;
    const fullText = $el.text();

    // 日付抽出
    const dateMatch = fullText.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/g);
    const eventDate = dateMatch ? parseDate(dateMatch[0]) : null;
    const eventDateEnd = dateMatch && dateMatch.length > 1 ? parseDate(dateMatch[dateMatch.length - 1]) : null;

    // 会場: 「会場：」「場所：」の後ろ
    const venueMatch = fullText.match(/(?:会場|場所)[：:]\s*([^\n\r　]+)/);
    const venue = venueMatch ? venueMatch[1].trim() : null;

    events.push({
      guid: url,
      title,
      organizer: '日本語教育学会',
      event_type: inferEventType(title),
      event_date: eventDate,
      event_date_end: eventDateEnd !== eventDate ? eventDateEnd : null,
      deadline: null,
      venue,
      url,
      description: null,
    });
  });

  return events;
}

// -----------------------------------------------------------------------
// 2. 9640.jp 学会情報
// https://www.9640.jp/topics/gakkai/
// -----------------------------------------------------------------------
async function scrape9640(): Promise<ScrapedEvent[]> {
  const BASE = 'https://www.9640.jp';
  const html = await fetchHtml(`${BASE}/topics/gakkai/`);
  const $ = cheerio.load(html);
  const events: ScrapedEvent[] = [];

  $('li').each((_, el) => {
    const $el = $(el);
    const anchor = $el.find('a[href*="/gakkai/"]').first();
    const title = anchor.text().trim();
    if (!title || title.length < 4) return;

    const href = anchor.attr('href') || '';
    const url = href.startsWith('http') ? href : `${BASE}${href}`;

    // 日付: <strong>タグ
    const dateText = $el.find('strong').first().text().trim();
    const eventDate = parseDate(dateText);

    // 日付範囲があれば終了日も
    const dateRangeMatch = dateText.match(/(\d{4}[\/\.\-]\d{1,2}[\/\.\-]\d{1,2})\s*[〜~]\s*(\d{4}[\/\.\-]\d{1,2}[\/\.\-]\d{1,2})/);
    let eventDateEnd: string | null = null;
    if (dateRangeMatch) {
      eventDateEnd = parseDate(dateRangeMatch[2]);
    }

    // 会場: アンカーの後ろのテキスト
    const fullText = $el.text();
    const venueMatch = fullText.replace(dateText, '').replace(title, '').trim();
    const venue = venueMatch.length > 2 && venueMatch.length < 50 ? venueMatch : null;

    events.push({
      guid: url,
      title,
      organizer: '9640.jp',
      event_type: inferEventType(title),
      event_date: eventDate,
      event_date_end: eventDateEnd,
      deadline: null,
      venue,
      url,
      description: null,
    });
  });

  return events;
}

// -----------------------------------------------------------------------
// 3. 凡人社イベント
// https://www.bonjinsha.com/event
// -----------------------------------------------------------------------
async function scrapeBonjinsha(): Promise<ScrapedEvent[]> {
  const BASE = 'https://www.bonjinsha.com';
  const html = await fetchHtml(`${BASE}/event`);
  const $ = cheerio.load(html);
  const events: ScrapedEvent[] = [];

  $('li').each((_, el) => {
    const $el = $(el);
    const anchor = $el.find('a[href*="/event/"]').first();
    const title = anchor.text().trim();
    if (!title || title.length < 4) return;

    const href = anchor.attr('href') || '';
    const url = href.startsWith('http') ? href : `${BASE}${href}`;

    const fullText = $el.text();

    // "開催予定 2026/03.15" or "2026/3/15" style
    const dateMatch = fullText.match(/(\d{4})[\/\.](\d{1,2})[\/\.\-](\d{1,2})/);
    const eventDate = dateMatch
      ? `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`
      : null;

    // オンライン or 会場名
    const onlineMatch = /オンライン/.test(fullText);
    const venueMatch = fullText.match(/(?:会場|場所)[：:]\s*([^\n\r　]+)/);
    const venue = venueMatch ? venueMatch[1].trim() : onlineMatch ? 'オンライン' : null;

    events.push({
      guid: url,
      title,
      organizer: '凡人社',
      event_type: inferEventType(title),
      event_date: eventDate,
      event_date_end: null,
      deadline: null,
      venue,
      url,
      description: null,
    });
  });

  return events;
}

// -----------------------------------------------------------------------
// 4. UALS Google Calendar (iCal)
// -----------------------------------------------------------------------
function unfoldIcal(ical: string): string {
  return ical.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
}

function parseIcalDate(value: string): string | null {
  // YYYYMMDD
  const dateOnly = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`;
  // YYYYMMDDTHHMMSS[Z]
  const dateTime = value.match(/^(\d{4})(\d{2})(\d{2})T/);
  if (dateTime) return `${dateTime[1]}-${dateTime[2]}-${dateTime[3]}`;
  return null;
}

// iCalのDTEND（全日イベント）は翌日なので1日引く
function adjustIcalEndDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function scrapeUalsCalendar(): Promise<ScrapedEvent[]> {
  const iCalUrl = 'https://calendar.google.com/calendar/ical/uals.forum%40gmail.com/public/basic.ics';
  let icalText: string;
  try {
    const res = await fetch(iCalUrl, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    icalText = await res.text();
  } catch (err) {
    console.error('[Events] UALS iCal fetch failed:', err);
    return [];
  }

  const unfolded = unfoldIcal(icalText);
  const events: ScrapedEvent[] = [];
  const vevents = unfolded.split(/BEGIN:VEVENT/i).slice(1);

  for (const vevent of vevents) {
    const get = (field: string) => {
      const re = new RegExp(`^${field}(?:;[^:]+)?:(.+)$`, 'im');
      const m = vevent.match(re);
      return m ? m[1].replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').trim() : null;
    };

    const summary = get('SUMMARY');
    if (!summary) continue;

    const uid = get('UID') || `uals-${summary}`;
    const dtstart = get('DTSTART');
    const dtend = get('DTEND');
    const location = get('LOCATION');
    const description = get('DESCRIPTION');
    const url = get('URL');

    const eventDate = dtstart ? parseIcalDate(dtstart) : null;
    const rawEnd = dtend ? parseIcalDate(dtend) : null;
    // 全日イベントのDTENDは翌日なので調整
    const isAllDay = dtstart?.length === 8 || dtstart?.includes('VALUE=DATE');
    const eventDateEnd = isAllDay ? adjustIcalEndDate(rawEnd) : rawEnd;

    // DESCRIPTION内のURL抽出
    const descUrl = description?.match(/https?:\/\/[^\s\\]+/)?.[0] || null;

    events.push({
      guid: uid,
      title: summary,
      organizer: 'UALS',
      event_type: inferEventType(summary),
      event_date: eventDate,
      event_date_end: eventDateEnd !== eventDate ? eventDateEnd : null,
      deadline: null,
      venue: location || null,
      url: url || descUrl,
      description: null,
    });
  }

  return events;
}

// -----------------------------------------------------------------------
// 5. JACTFL
// https://www.jactfl.or.jp/?page_id=126
// -----------------------------------------------------------------------
async function scrapeJactfl(): Promise<ScrapedEvent[]> {
  const BASE = 'https://www.jactfl.or.jp';
  const html = await fetchHtml(`${BASE}/?page_id=126`);
  const $ = cheerio.load(html);
  const events: ScrapedEvent[] = [];

  // WordPressスタイルのリスト
  $('li').each((_, el) => {
    const $el = $(el);
    // タイトルリンク: ?p= を含むもの（カテゴリリンク?cat=は除く）
    const anchor = $el.find('a[href*="?p="], a[href*="/archives/"]').first();
    const title = anchor.text().trim();
    if (!title || title.length < 4) return;

    const href = anchor.attr('href') || '';
    const url = href.startsWith('http') ? href : `${BASE}${href}`;

    // 日付: テキストノードから抽出
    const fullText = $el.text();
    const dateMatch = fullText.match(/(\d{4})[\.\/\-](\d{1,2})[\.\/\-](\d{1,2})/);
    const eventDate = dateMatch
      ? `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`
      : null;

    events.push({
      guid: url,
      title,
      organizer: 'JACTFL',
      event_type: inferEventType(title),
      event_date: eventDate,
      event_date_end: null,
      deadline: null,
      venue: null,
      url,
      description: null,
    });
  });

  return events;
}

// -----------------------------------------------------------------------
// 6. 国立国語研究所 (NINJAL)
// https://www.ninjal.ac.jp/news/2025/
// https://www.ninjal.ac.jp/news/2026/
// -----------------------------------------------------------------------
async function scrapeNinjal(): Promise<ScrapedEvent[]> {
  const BASE = 'https://www.ninjal.ac.jp';
  const thisYear = new Date().getFullYear();
  const events: ScrapedEvent[] = [];

  for (const year of [thisYear, thisYear + 1]) {
    let html: string;
    try {
      html = await fetchHtml(`${BASE}/news/${year}/`);
    } catch {
      continue;
    }
    const $ = cheerio.load(html);

    // 各ニュース項目を走査
    $('li, .news-item, article, tr').each((_, el) => {
      const $el = $(el);
      const fullText = $el.text();

      // 「催し物」カテゴリを優先するが、他のイベント記述も拾う
      const isEvent = /催し物|大会|シンポジウム|講演|ワークショップ|フォーラム/.test(fullText);
      if (!isEvent) return;

      const specificAnchor = $el.find('a[href*="/events_jp/"], a[href*="/events/"], a[href*="/lecture/"], a[href*="/symposium/"]').first();
      const anchor = specificAnchor.length ? specificAnchor : $el.find('a').first();
      const title = anchor.text().trim() || $el.find('h2, h3, .title').text().trim();
      if (!title || title.length < 4) return;

      const href = anchor.attr('href') || '';
      const url = href.startsWith('http') ? href : href ? `${BASE}${href}` : null;

      // 「日時：」から開催日を抽出
      const jijiMatch = fullText.match(/日時[：:]\s*(\d{4}年\s*\d{1,2}月\s*\d{1,2}日)/);
      const eventDate = jijiMatch ? parseDate(jijiMatch[1]) : null;

      // 「会場：」から会場を抽出
      const venueMatch = fullText.match(/会場[：:]\s*([^\n\r　。、]{2,40})/);
      const venue = venueMatch ? venueMatch[1].trim() : null;

      events.push({
        guid: url || `ninjal-${year}-${title}`,
        title,
        organizer: '国立国語研究所',
        event_type: inferEventType(title),
        event_date: eventDate,
        event_date_end: null,
        deadline: null,
        venue,
        url,
        description: null,
      });
    });
  }

  return events;
}

// -----------------------------------------------------------------------
// メインエクスポート
// -----------------------------------------------------------------------
const SCRAPERS: { name: string; fn: () => Promise<ScrapedEvent[]> }[] = [
  { name: '日本語教育学会', fn: scrapeNkg },
  { name: '9640.jp', fn: scrape9640 },
  { name: '凡人社', fn: scrapeBonjinsha },
  { name: 'UALS', fn: scrapeUalsCalendar },
  { name: 'JACTFL', fn: scrapeJactfl },
  { name: '国立国語研究所', fn: scrapeNinjal },
];

export async function fetchAllEvents(): Promise<void> {
  console.log('[Events] Starting event scraping...');

  for (const { name, fn } of SCRAPERS) {
    try {
      console.log(`[Events] Scraping: ${name}`);
      const scraped = await fn();

      // 6か月以内のイベントのみ保存
      const relevant = scraped.filter((e) => isWithin6Months(e.event_date));
      let count = 0;
      for (const event of relevant) {
        try {
          upsertEvent(event);
          count++;
        } catch (err) {
          console.error(`[Events] Failed to upsert: ${event.title}`, err);
        }
      }
      console.log(`[Events] ${name}: ${count}件保存 (${scraped.length}件取得)`);
    } catch (err) {
      console.error(`[Events] Error scraping ${name}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log('[Events] Done');
}
