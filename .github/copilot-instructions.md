# JPEdu Copilot Instructions

## Project Overview
**JPEdu** is a personal news portal for Japanese language educators, running locally on macOS. It aggregates news from 7 RSS feeds and 2 web scraping sources (Ministry of Education, Culture Agency, Japan Foundation) related to Japanese language education, multiculturalism, and foreign labor policies. Built with Next.js 16, TypeScript, SQLite, and Tailwind CSS.

## Architecture

### Core Data Flow
1. **RSS Feed Fetching** (`lib/rss.ts`): Pulls from RSS sources, extracts images, applies relevance filters
2. **Web Scraping** (`lib/scraper.ts`): Parses HTML from bunka.go.jp and jpf.go.jp
3. **Auto-Categorization** (`lib/categorize.ts`): Keyword-based classification into 4 categories (政策/海外動向/教材・研究/その他)
4. **OG Image Fetching** (`lib/og.ts`): Background job fetching article thumbnail images
5. **SQLite Storage** (`lib/db.ts`): Persistent storage with WAL mode
6. **API Layer** (`app/api/`): REST endpoints for articles, favorites, and refresh operations
7. **React Frontend** (`app/page.tsx`): 50-article-per-page pagination with category tabs

### Key Design Decisions
- **SQLite for local-only storage**: Single-file database at `data/jpedu.db`, initialized lazily on first access
- **Relevance filtering**: Culture Agency/Ministry articles require keyword matching (日本語教育, 外国人, etc.) to avoid noise; Google News/JPF sources trust their selection
- **Sentinel value for image_url**: Uses empty string `''` to mark "fetched but no image found" to prevent re-fetching
- **Async OG fetching**: Image URLs retrieved post-feed-update, max 5 concurrent requests, no retry on Google News (JS redirect limitation)
- **Duplicate prevention**: `guid` column with UNIQUE constraint; `INSERT ON CONFLICT DO NOTHING` pattern
- **Button hierarchy fix**: Outer article cards use `<div className="cursor-pointer">` not `<button>` to avoid nested button HTML errors

## Critical Workflows

### Adding a New RSS Feed
Edit `lib/db.ts` in `seedRssSources()`:
```typescript
rssSources.push({
  name: 'Feed Name',
  url: 'https://example.com/feed.xml',
});
```
If URL contains Japanese or special chars, **pre-URL-encode all query params** before passing to `parseString()` (see Googleニュース feeds—URLエンコード済み pattern).

### Updating the Database Schema
1. Add new column in `initializeSchema()` using `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE`
2. Update `Article` interface in `app/page.tsx` and DB result types
3. For migrations: Use `ALTER TABLE IF NOT EXISTS` checks to support fresh installs

### Fresh Database Reset
Delete `data/jpedu.db` and restart—schema auto-initializes on next `getDb()` call.

## Important Patterns

### Category Keywords (`lib/categorize.ts`)
- `政策`: law, policy, special status (特定技能), entry (在留), immigration (入管), multiculturalism (多文化共生)
- `海外動向`: overseas, JLPT, international, Asia, European/American regions
- `教材・研究`: materials, research, academic conferences, curricula, papers
- `その他`: default catch-all

### Filtering Logic
- **`isRelevantArticle()`**: Checks `RELEVANCE_KEYWORDS` (日本語教育, 外国人, etc.). Only applied to bunka.go.jp and mext.go.jp. **Not applied** to Googleニュース or JPF (already filtered by source selection).
- **`extractImageUrl()`**: Tries `enclosure`, `mediaContent`, `mediaThumbnail`, then fallback `<img>` tag parsing. Returns `undefined` if none found.

### OG Image Fetching (`lib/og.ts`)
- Triggered after `fetchAllFeeds()` completes
- Fetches articles where `image_url IS NULL`, limit 30 per call
- Concurrency: 5 concurrent requests via `Promise.all()`
- **Skips**: Google News URLs (contains `news.google.com`) and Google/Googleusercontent domains
- Saves empty string `''` if no OG image found (blocks future re-fetch attempts)

### API Response Structure
```typescript
interface ArticlesResponse {
  articles: Article[],
  total: number,           // Total articles matching filter
  lastUpdated: string | null  // ISO timestamp of last /refresh POST
}
```

## Database Schema

### articles table
- `id`: auto-increment primary key
- `guid`: UNIQUE identifier (RSS guid or derived from link/title)
- `title`, `link`, `summary`: article content
- `source_name`: RSS feed name
- `published_at`: ISO timestamp from RSS
- `category`: one of 4 enum values (set by `categorize()`)
- `is_read`: 0/1 flag (toggled by POST `/api/articles/[id]/read`)
- `is_favorite`: 0/1 flag (toggled by POST `/api/articles/[id]/favorite`)
- `image_url`: URL string | empty string `''` | NULL (not yet fetched)
- `created_at`: insertion timestamp

### rss_sources table
- Used for duplicate-prevention tracking
- `last_fetched_at` updated after each `fetchAllFeeds()`

## Known Limitations & Workarounds

1. **Google News images unavailable**: JS redirect prevents actual article access. Placeholder shows feed source first letter instead.
2. **Delayed thumbnails**: OG images fetched post-update; initial refresh may show no images. Second refresh populates them.
3. **JPF URL instability**: URL format depends on Japanese fiscal year (4月始まり); may fail during year transitions.
4. **Node-cron not used yet**: Event scheduling planned for Phase 2.

## Development Commands
```bash
npm run dev      # Next.js dev server (port 3000)
npm run build    # Production build
npm run start    # Run production build
npm run lint     # ESLint check
```

## Key File Responsibility Map
- **API routes** (`app/api/*/route.ts`): HTTP handlers, use `force-dynamic` for real-time data
- **Page component** (`app/page.tsx`): Category tabs, pagination, favorite/read toggles, refresh button
- **lib/db.ts**: Schema init, CRUD ops, migrations
- **lib/rss.ts**: Feed parsing, image extraction, relevance filtering
- **lib/categorize.ts**: Keyword matching, category assignment
- **lib/scraper.ts**: HTML parsing for bunka.go.jp and jpf.go.jp
- **lib/og.ts**: OG meta tag fetching for missing images

---

**Last Updated**: 2026-03-16
