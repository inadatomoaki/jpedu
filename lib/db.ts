import { createClient, Client, Row } from '@libsql/client';

let _client: Client | null = null;
let _initialized = false;

function getClient(): Client {
  if (_client) return _client;
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error('TURSO_DATABASE_URL is not set');
  _client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  return _client;
}

async function ensureInitialized(): Promise<Client> {
  const client = getClient();
  if (_initialized) return client;

  await client.batch(
    [
      {
        sql: `CREATE TABLE IF NOT EXISTS articles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          guid TEXT UNIQUE,
          title TEXT,
          link TEXT,
          summary TEXT,
          source_name TEXT,
          published_at TEXT,
          category TEXT,
          is_read INTEGER DEFAULT 0,
          is_favorite INTEGER DEFAULT 0,
          image_url TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`,
        args: [],
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS rss_sources (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          url TEXT UNIQUE,
          last_fetched_at TEXT
        )`,
        args: [],
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category)`,
        args: [],
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at)`,
        args: [],
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_articles_is_read ON articles(is_read)`,
        args: [],
      },
      {
        sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_rss_sources_url ON rss_sources(url)`,
        args: [],
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS events (
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
        )`,
        args: [],
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_events_event_date ON events(event_date)`,
        args: [],
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_events_organizer ON events(organizer)`,
        args: [],
      },
    ],
    'write'
  );

  await seedRssSources(client);
  _initialized = true;
  return client;
}

async function seedRssSources(client: Client): Promise<void> {
  const sources = [
    { name: '文部科学省', url: 'https://www.mext.go.jp/b_menu/news/index.rdf' },
    { name: '文化庁', url: 'https://www.bunka.go.jp/koho_hodo_oshirase/hodohappyo/' },
    { name: '国際交流基金', url: 'https://www.jpf.go.jp/j/about/press/' },
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
    await client.execute({
      sql: `INSERT INTO rss_sources (name, url, last_fetched_at)
            VALUES (?, ?, NULL)
            ON CONFLICT(url) DO NOTHING`,
      args: [source.name, source.url],
    });
  }
}

function rowToArticle(row: Row): Article {
  return {
    id: row.id as number,
    guid: row.guid as string,
    title: row.title as string,
    link: row.link as string,
    summary: row.summary as string,
    source_name: row.source_name as string,
    published_at: row.published_at as string,
    category: row.category as string,
    is_read: row.is_read as number,
    is_favorite: row.is_favorite as number,
    image_url: row.image_url as string | null,
    created_at: row.created_at as string,
  };
}

function rowToRssSource(row: Row): RssSource {
  return {
    id: row.id as number,
    name: row.name as string,
    url: row.url as string,
    last_fetched_at: row.last_fetched_at as string | null,
  };
}

function rowToEvent(row: Row): Event {
  return {
    id: row.id as number,
    guid: row.guid as string,
    title: row.title as string,
    organizer: row.organizer as string | null,
    event_type: row.event_type as string,
    event_date: row.event_date as string | null,
    event_date_end: row.event_date_end as string | null,
    deadline: row.deadline as string | null,
    venue: row.venue as string | null,
    url: row.url as string | null,
    description: row.description as string | null,
    created_at: row.created_at as string,
  };
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

export async function getArticles(options: {
  category?: string;
  favorite?: boolean;
  page?: number;
  limit?: number;
}): Promise<{ articles: Article[]; total: number; lastUpdated: string | null }> {
  const client = await ensureInitialized();
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

  const countResult = await client.execute({
    sql: `SELECT COUNT(*) as c FROM articles ${whereClause}`,
    args: params,
  });
  const total = countResult.rows[0].c as number;

  const articlesResult = await client.execute({
    sql: `SELECT * FROM articles ${whereClause}
          ORDER BY published_at DESC, created_at DESC
          LIMIT ? OFFSET ?`,
    args: [...params, limit, offset],
  });

  const lastUpdatedResult = await client.execute({
    sql: 'SELECT MAX(last_fetched_at) as lu FROM rss_sources',
    args: [],
  });

  return {
    articles: articlesResult.rows.map(rowToArticle),
    total,
    lastUpdated: (lastUpdatedResult.rows[0]?.lu as string | null) ?? null,
  };
}

export async function markArticleAsRead(id: number): Promise<void> {
  const client = await ensureInitialized();
  await client.execute({
    sql: 'UPDATE articles SET is_read = 1 WHERE id = ?',
    args: [id],
  });
}

export async function toggleFavorite(id: number): Promise<number> {
  const client = await ensureInitialized();
  await client.execute({
    sql: 'UPDATE articles SET is_favorite = CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END WHERE id = ?',
    args: [id],
  });
  const result = await client.execute({
    sql: 'SELECT is_favorite FROM articles WHERE id = ?',
    args: [id],
  });
  return result.rows[0].is_favorite as number;
}

export async function upsertArticle(
  article: Omit<Article, 'id' | 'created_at' | 'is_read' | 'is_favorite'>
): Promise<void> {
  const client = await ensureInitialized();
  await client.execute({
    sql: `INSERT INTO articles (guid, title, link, summary, source_name, published_at, category, image_url)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(guid) DO UPDATE SET
            title = excluded.title,
            link = excluded.link,
            summary = excluded.summary,
            source_name = excluded.source_name,
            published_at = excluded.published_at,
            category = excluded.category,
            image_url = COALESCE(excluded.image_url, articles.image_url)`,
    args: [
      article.guid,
      article.title,
      article.link,
      article.summary,
      article.source_name,
      article.published_at,
      article.category,
      article.image_url ?? null,
    ],
  });
}

export async function updateSourceFetchedAt(id: number): Promise<void> {
  const client = await ensureInitialized();
  await client.execute({
    sql: 'UPDATE rss_sources SET last_fetched_at = ? WHERE id = ?',
    args: [new Date().toISOString(), id],
  });
}

export async function getRssSources(): Promise<RssSource[]> {
  const client = await ensureInitialized();
  const result = await client.execute({ sql: 'SELECT * FROM rss_sources', args: [] });
  return result.rows.map(rowToRssSource);
}

export async function updateArticleImageUrl(id: number, imageUrl: string): Promise<void> {
  const client = await ensureInitialized();
  await client.execute({
    sql: 'UPDATE articles SET image_url = ? WHERE id = ?',
    args: [imageUrl, id],
  });
}

export async function getArticlesWithoutImages(limit: number): Promise<{ id: number; link: string }[]> {
  const client = await ensureInitialized();
  const result = await client.execute({
    sql: 'SELECT id, link FROM articles WHERE image_url IS NULL ORDER BY published_at DESC LIMIT ?',
    args: [limit],
  });
  return result.rows.map((r) => ({ id: r.id as number, link: r.link as string }));
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

export async function upsertEvent(event: Omit<Event, 'id' | 'created_at'>): Promise<void> {
  const client = await ensureInitialized();
  await client.execute({
    sql: `INSERT INTO events (guid, title, organizer, event_type, event_date, event_date_end, deadline, venue, url, description)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(guid) DO UPDATE SET
            title = excluded.title,
            organizer = excluded.organizer,
            event_type = excluded.event_type,
            event_date = excluded.event_date,
            event_date_end = excluded.event_date_end,
            deadline = excluded.deadline,
            venue = excluded.venue,
            url = excluded.url,
            description = excluded.description`,
    args: [
      event.guid,
      event.title,
      event.organizer ?? null,
      event.event_type,
      event.event_date ?? null,
      event.event_date_end ?? null,
      event.deadline ?? null,
      event.venue ?? null,
      event.url ?? null,
      event.description ?? null,
    ],
  });
}

export async function getEvents(
  options: { upcoming?: boolean; organizer?: string } = {}
): Promise<Event[]> {
  const client = await ensureInitialized();
  const { upcoming = true, organizer } = options;
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (upcoming) {
    const today = new Date().toISOString().slice(0, 10);
    conditions.push(
      `(event_date IS NULL OR event_date >= ? OR (event_date_end IS NOT NULL AND event_date_end >= ?))`
    );
    params.push(today, today);
  }
  if (organizer) {
    conditions.push('organizer = ?');
    params.push(organizer);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await client.execute({
    sql: `SELECT * FROM events ${whereClause} ORDER BY event_date ASC, created_at DESC`,
    args: params,
  });
  return result.rows.map(rowToEvent);
}

export async function getEventOrganizers(): Promise<string[]> {
  const client = await ensureInitialized();
  const result = await client.execute({
    sql: 'SELECT DISTINCT organizer FROM events WHERE organizer IS NOT NULL ORDER BY organizer',
    args: [],
  });
  return result.rows.map((r) => r.organizer as string);
}
