import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'jpedu.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  initializeSchema(_db);
  seedRssSources(_db);

  return _db;
}

function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guid TEXT UNIQUE,
      title TEXT,
      link TEXT,
      summary TEXT,
      source_name TEXT,
      published_at TEXT,
      category TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rss_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      url TEXT UNIQUE,
      last_fetched_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);
    CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at);
    CREATE INDEX IF NOT EXISTS idx_articles_is_read ON articles(is_read);
  `);

  // 既存DBにurl UNIQUE制約がない場合のマイグレーション
  try {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_rss_sources_url ON rss_sources(url)`);
  } catch {
    // すでに制約がある場合は無視
  }

  // is_favorite カラムのマイグレーション
  try {
    db.exec(`ALTER TABLE articles ADD COLUMN is_favorite INTEGER DEFAULT 0`);
  } catch {
    // すでにカラムがある場合は無視
  }

  // image_url カラムのマイグレーション
  try {
    db.exec(`ALTER TABLE articles ADD COLUMN image_url TEXT`);
  } catch {
    // すでにカラムがある場合は無視
  }

  // events テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guid TEXT UNIQUE,
      title TEXT NOT NULL,
      organizer TEXT,
      event_type TEXT DEFAULT 'その他',
      event_date TEXT,
      event_date_end TEXT,
      deadline TEXT,
      venue TEXT,
      url TEXT,
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_events_event_date ON events(event_date);
    CREATE INDEX IF NOT EXISTS idx_events_organizer ON events(organizer);
  `);
}

function seedRssSources(db: Database.Database): void {
  const upsert = db.prepare(`
    INSERT INTO rss_sources (name, url, last_fetched_at)
    VALUES (?, ?, NULL)
    ON CONFLICT(url) DO NOTHING
  `);

  const sources = [
    {
      name: '文部科学省',
      url: 'https://www.mext.go.jp/b_menu/news/index.rdf',
    },
    {
      // スクレイピング対象（URLはダミー、scraper.tsで取得）
      name: '文化庁',
      url: 'https://www.bunka.go.jp/koho_hodo_oshirase/hodohappyo/',
    },
    {
      // スクレイピング対象（URLはダミー、scraper.tsで取得）
      name: '国際交流基金',
      url: 'https://www.jpf.go.jp/j/about/press/',
    },
    // Google ニュース キーワード検索RSS（日本語キーワードはURLエンコード済み）
    {
      name: 'Googleニュース: 日本語教育',
      url: 'https://news.google.com/rss/search?q=%E6%97%A5%E6%9C%AC%E8%AA%9E%E6%95%99%E8%82%B2&hl=ja&gl=JP&ceid=JP:ja',
    },
    {
      name: 'Googleニュース: 日本語学',
      url: 'https://news.google.com/rss/search?q=%E6%97%A5%E6%9C%AC%E8%AA%9E%E5%AD%A6&hl=ja&gl=JP&ceid=JP:ja',
    },
    {
      name: 'Googleニュース: 外国人労働',
      url: 'https://news.google.com/rss/search?q=%E5%A4%96%E5%9B%BD%E4%BA%BA%E5%8A%B4%E5%83%8D&hl=ja&gl=JP&ceid=JP:ja',
    },
    {
      name: 'Googleニュース: 異文化理解',
      url: 'https://news.google.com/rss/search?q=%E7%95%B0%E6%96%87%E5%8C%96%E7%90%86%E8%A7%A3&hl=ja&gl=JP&ceid=JP:ja',
    },
    {
      name: 'Googleニュース: 多文化共生',
      url: 'https://news.google.com/rss/search?q=%E5%A4%9A%E6%96%87%E5%8C%96%E5%85%B1%E7%94%9F&hl=ja&gl=JP&ceid=JP:ja',
    },
    {
      name: 'Googleニュース: 移民',
      url: 'https://news.google.com/rss/search?q=%E7%A7%BB%E6%B0%91&hl=ja&gl=JP&ceid=JP:ja',
    },
  ];

  for (const source of sources) {
    upsert.run(source.name, source.url);
  }
}

export interface Article {
  id: number;
  guid: string;
  title: string;
  link: string;
  summary: string;
  source_name: string;
  published_at: string;
  category: string;
  is_read: number;
  is_favorite: number;
  image_url: string | null;
  created_at: string;
}

export interface RssSource {
  id: number;
  name: string;
  url: string;
  last_fetched_at: string | null;
}

export function getArticles(options: {
  category?: string;
  favorite?: boolean;
  page?: number;
  limit?: number;
}): { articles: Article[]; total: number; lastUpdated: string | null } {
  const db = getDb();
  const { category, favorite, page = 1, limit = 50 } = options;
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (category && category !== 'すべて') {
    conditions.push('category = ?');
    params.push(category);
  }
  if (favorite) {
    conditions.push('is_favorite = 1');
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = (
    db.prepare(`SELECT COUNT(*) as c FROM articles ${whereClause}`).get(...params) as { c: number }
  ).c;

  const articles = db
    .prepare(
      `SELECT * FROM articles ${whereClause}
       ORDER BY published_at DESC, created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as Article[];

  const lastUpdatedRow = db
    .prepare('SELECT MAX(last_fetched_at) as lu FROM rss_sources')
    .get() as { lu: string | null };

  return {
    articles,
    total,
    lastUpdated: lastUpdatedRow?.lu ?? null,
  };
}

export function markArticleAsRead(id: number): void {
  const db = getDb();
  db.prepare('UPDATE articles SET is_read = 1 WHERE id = ?').run(id);
}

export function toggleFavorite(id: number): number {
  const db = getDb();
  db.prepare('UPDATE articles SET is_favorite = CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END WHERE id = ?').run(id);
  const row = db.prepare('SELECT is_favorite FROM articles WHERE id = ?').get(id) as { is_favorite: number };
  return row.is_favorite;
}

export function upsertArticle(article: Omit<Article, 'id' | 'created_at' | 'is_read' | 'is_favorite'>): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO articles (guid, title, link, summary, source_name, published_at, category, image_url)
    VALUES (@guid, @title, @link, @summary, @source_name, @published_at, @category, @image_url)
    ON CONFLICT(guid) DO UPDATE SET
      title = excluded.title,
      link = excluded.link,
      summary = excluded.summary,
      source_name = excluded.source_name,
      published_at = excluded.published_at,
      category = excluded.category,
      image_url = COALESCE(excluded.image_url, articles.image_url)
  `).run(article);
}

export function updateSourceFetchedAt(id: number): void {
  const db = getDb();
  db.prepare('UPDATE rss_sources SET last_fetched_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    id
  );
}

export function getRssSources(): RssSource[] {
  const db = getDb();
  return db.prepare('SELECT * FROM rss_sources').all() as RssSource[];
}

export interface Event {
  id: number;
  guid: string;
  title: string;
  organizer: string | null;
  event_type: string;
  event_date: string | null;
  event_date_end: string | null;
  deadline: string | null;
  venue: string | null;
  url: string | null;
  description: string | null;
  created_at: string;
}

export function upsertEvent(event: Omit<Event, 'id' | 'created_at'>): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO events (guid, title, organizer, event_type, event_date, event_date_end, deadline, venue, url, description)
    VALUES (@guid, @title, @organizer, @event_type, @event_date, @event_date_end, @deadline, @venue, @url, @description)
    ON CONFLICT(guid) DO UPDATE SET
      title = excluded.title,
      organizer = excluded.organizer,
      event_type = excluded.event_type,
      event_date = excluded.event_date,
      event_date_end = excluded.event_date_end,
      deadline = excluded.deadline,
      venue = excluded.venue,
      url = excluded.url,
      description = excluded.description
  `).run(event);
}

export function getEvents(options: {
  upcoming?: boolean;
  organizer?: string;
} = {}): Event[] {
  const db = getDb();
  const { upcoming = true, organizer } = options;
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (upcoming) {
    // event_date が今日以降、またはevent_dateがnullのもの（締切等）
    const today = new Date().toISOString().slice(0, 10);
    conditions.push(`(event_date IS NULL OR event_date >= ? OR (event_date_end IS NOT NULL AND event_date_end >= ?))`);
    params.push(today, today);
  }
  if (organizer) {
    conditions.push('organizer = ?');
    params.push(organizer);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return db
    .prepare(`SELECT * FROM events ${whereClause} ORDER BY event_date ASC, created_at DESC`)
    .all(...params) as Event[];
}

export function getEventOrganizers(): string[] {
  const db = getDb();
  const rows = db.prepare('SELECT DISTINCT organizer FROM events WHERE organizer IS NOT NULL ORDER BY organizer').all() as { organizer: string }[];
  return rows.map((r) => r.organizer);
}
