# JPEdu Portal — 開発仕様・開発手順まとめ

## 概要

日本語教師向けの個人用ニュースポータルアプリ。ログイン不要・ローカルMac専用。
日本語教育・多文化共生・外国人労働などに関するニュースを自動収集・表示する。

---

## フェーズ構成

| フェーズ | 内容 | 状態 |
|---------|------|------|
| Phase 1 | 最新ニュース収集・表示 | 完了 |
| Phase 2 | 学会・イベント情報 | 未着手 |

---

## 技術スタック

| 要素 | 技術 |
|------|------|
| フレームワーク | Next.js (App Router) |
| スタイリング | Tailwind CSS |
| DB | SQLite (`better-sqlite3`) |
| RSSパーサー | `rss-parser` |
| スクレイピング | `cheerio` |
| 言語 | TypeScript |
| 実行環境 | ローカル Mac (Node.js) |

---

## データソース

### RSS フィード

| ソース名 | URL |
|---------|-----|
| 文部科学省 | `https://www.mext.go.jp/b_menu/news/index.rdf` |
| Googleニュース: 日本語教育 | `https://news.google.com/rss/search?q=日本語教育&hl=ja&gl=JP&ceid=JP:ja` (URLエンコード済み) |
| Googleニュース: 日本語学 | 同上 |
| Googleニュース: 外国人労働 | 同上 |
| Googleニュース: 異文化理解 | 同上 |
| Googleニュース: 多文化共生 | 同上 |
| Googleニュース: 移民 | 同上 |

### スクレイピング

| ソース名 | URL |
|---------|-----|
| 文化庁 | `https://www.bunka.go.jp/koho_hodo_oshirase/hodohappyo/` |
| 国際交流基金 | `https://www.jpf.go.jp/j/about/press/{会計年度}/` |

---

## ファイル構成

```
jpedu/
├── app/
│   ├── layout.tsx              # アプリ共通レイアウト
│   ├── page.tsx                # メインページ（記事一覧）
│   └── api/
│       ├── articles/
│       │   ├── route.ts        # GET /api/articles（一覧取得）
│       │   └── [id]/
│       │       ├── read/route.ts     # POST（既読マーク）
│       │       └── favorite/route.ts # POST（お気に入りトグル）
│       └── refresh/route.ts    # POST /api/refresh（フィード更新）
├── lib/
│   ├── db.ts                   # SQLite DB管理・CRUD
│   ├── rss.ts                  # RSSフィード取得・保存
│   ├── scraper.ts              # Webスクレイピング
│   ├── categorize.ts           # カテゴリ自動分類・関連性フィルタ
│   └── og.ts                   # OG画像バックグラウンド取得
├── data/
│   └── jpedu.db                # SQLiteデータベース（自動生成）
└── DEVELOPMENT.md              # 本ファイル
```

---

## データベーススキーマ

### articles テーブル

```sql
CREATE TABLE articles (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guid         TEXT UNIQUE,
  title        TEXT,
  link         TEXT,
  summary      TEXT,
  source_name  TEXT,
  published_at TEXT,
  category     TEXT,
  is_read      INTEGER DEFAULT 0,
  is_favorite  INTEGER DEFAULT 0,  -- マイグレーションで追加
  image_url    TEXT,                -- マイグレーションで追加（NULL=未取得、''=取得済み画像なし）
  created_at   TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### rss_sources テーブル

```sql
CREATE TABLE rss_sources (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT,
  url            TEXT UNIQUE,
  last_fetched_at TEXT
);
```

---

## 主要機能

### カテゴリ自動分類 (`lib/categorize.ts`)

記事タイトルのキーワードマッチングで以下のカテゴリに自動分類：

| カテゴリ | 主なキーワード |
|---------|---------------|
| 政策 | 法律、政策、予算、外国人労働、特定技能、在留資格、多文化共生、移民 など |
| 海外動向 | 海外、国際、JLPT、異文化、国際理解 など |
| 教材・研究 | 教材、研究、学会、論文、カリキュラム など |
| その他 | 上記以外 |

### 関連性フィルタ (`isRelevantArticle`)

文化庁・文部科学省の記事は日本語教育に無関係なものが多いため、
`RELEVANCE_KEYWORDS`（日本語教育、外国人、多文化など）に一致しない記事はDBに保存しない。
Googleニュース・国際交流基金はフィルタなし（キーワード検索済みのため）。

### OG画像バックグラウンド取得 (`lib/og.ts`)

- フィード更新後に `image_url IS NULL` の記事を最大30件取得
- 並列数5でOG画像URLをフェッチ
- `image_url = ''`（空文字）を「取得済み・画像なし」のセンチネル値として保存し再取得を防止
- Google News記事はJSリダイレクトにより画像取得不可のためスキップ

---

## 画面・UI

- **カテゴリタブ**: すべて / お気に入り / 政策 / 海外動向 / 教材・研究 / その他
- **記事カード**: サムネイル・タイトル・カテゴリバッジ・ソース名・日付・要約
- **未読インジケータ**: 青丸（未読）/ 灰色丸（既読）
- **お気に入り**: 星ボタン（ホバー時表示、お気に入り記事は常時表示）
- **ページネーション**: 50件/ページ
- **更新ボタン**: RSSフィード手動更新、スピナーアニメーション付き
- **最終更新時刻**: 相対時刻表示（〇分前 / 〇時間前 / 〇日前）

---

## 開発手順・経緯

### Step 1: 初期構築
- Next.js + Tailwind CSS + `better-sqlite3` でプロジェクト作成
- 基本的なDB設計（articles, rss_sources）
- 文部科学省・文化庁・国際交流基金をRSS/スクレイピングで収集
- カテゴリ自動分類ロジック実装

### Step 2: Googleニュースソース追加
- 日本語教育関連キーワード6種でGoogleニュースRSSを追加
- **問題**: `rss-parser`の`parseURL()`が日本語URLでエラー
  - 原因: URLに未エンコード文字が含まれていた
  - 解決: URLキーワードをURLエンコード済みに変更 + `fetch()` → `parseString()`に変更
- **問題**: `seedRssSources`が初回しか動かずソースが追加されない
  - 解決: `INSERT ON CONFLICT(url) DO NOTHING` でURL単位のupsertに変更

### Step 3: 関連性フィルタ追加
- 文化庁・文部科学省の無関係記事が多数取得されていた
- `isRelevantArticle()`関数を`categorize.ts`に追加
- 既存の無関係記事をDBから削除（56件）

### Step 4: お気に入り機能
- `articles.is_favorite`カラム追加（ALTER TABLE マイグレーション）
- `/api/articles/[id]/favorite` POST エンドポイント追加
- フロントエンドに星ボタン・お気に入りタブ追加
- **問題**: button要素内にbutton要素があるHTMLエラー（ハイドレーションエラー）
  - 解決: 記事カード外側を`<button>`→`<div className="cursor-pointer">`に変更

### Step 5: サムネイル画像表示
- RSSフィードから画像URL抽出（enclosure / media:content / media:thumbnail / imgタグ）
- OGタグからのバックグラウンド取得機能（`lib/og.ts`）
- `image_url`カラム追加（ALTER TABLE マイグレーション）
- **問題**: Googleのロゴ画像が表示されていた
  - 原因: Google NewsのURLはJSリダイレクトのため実際の記事にアクセスできない
  - 解決: `news.google.com`のURLはOG取得スキップ、Googleドメイン画像はフィルタ
  - 既存のGoogle画像URL（89件）とGoogle News記事（618件）をDBで修正

---

## 既知の制限事項

- **Google Newsのサムネイル**: JavaScriptリダイレクトのため実際の記事画像を取得できない。ソース名の頭文字がプレースホルダーとして表示される。（Puppeteer等のヘッドレスブラウザなしには解決困難）
- **OG画像**: フィード更新時にバックグラウンド取得するため、初回表示では画像が出ない記事がある。再度更新すると徐々に埋まる。
- **国際交流基金**: 会計年度（4月始まり）ベースでURLを構築するため、年度切替時期に取得できないことがある。

---

## 今後の計画（Phase 2）

- 学会・イベント情報の収集・表示
- 対象: 日本語教育学会、日本語学会 等
- 機能: イベント日程・申込リンク・カレンダー表示

---

*最終更新: 2026-03-14*
