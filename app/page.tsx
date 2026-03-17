'use client';

import { useState, useEffect, useCallback } from 'react';

interface Article {
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

interface ArticlesResponse {
  articles: Article[];
  total: number;
  lastUpdated: string | null;
}

const CATEGORIES = ['すべて', 'お気に入り', '政策', '海外動向', '教材・研究', 'その他'] as const;
type CategoryTab = (typeof CATEGORIES)[number];

const CATEGORY_COLORS: Record<string, string> = {
  政策: 'bg-blue-100 text-blue-700',
  海外動向: 'bg-green-100 text-green-700',
  '教材・研究': 'bg-purple-100 text-purple-700',
  その他: 'bg-gray-100 text-gray-600',
};

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return '未取得';
  const now = new Date();
  const then = new Date(isoString);
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return 'たった今';
  if (diffMin < 60) return `${diffMin}分前`;
  if (diffHour < 24) return `${diffHour}時間前`;
  return `${diffDay}日前`;
}

function formatDate(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function HomePage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<CategoryTab>('すべて');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const LIMIT = 50;

  const fetchArticles = useCallback(
    async (cat: CategoryTab, pg: number) => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: pg.toString(),
          limit: LIMIT.toString(),
        });
        if (cat === 'お気に入り') {
          params.set('favorite', 'true');
        } else if (cat !== 'すべて') {
          params.set('category', cat);
        }

        const res = await fetch(`/api/articles?${params}`);
        if (!res.ok) throw new Error('データの取得に失敗しました');
        const data: ArticlesResponse = await res.json();
        setArticles(data.articles);
        setTotal(data.total);
        setLastUpdated(data.lastUpdated);
      } catch (err) {
        setError(err instanceof Error ? err.message : '不明なエラー');
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchArticles(selectedCategory, page);
  }, [selectedCategory, page, fetchArticles]);

  const handleCategoryChange = (cat: CategoryTab) => {
    setSelectedCategory(cat);
    setPage(1);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/refresh', { method: 'POST' });
      if (!res.ok) throw new Error('更新に失敗しました');
      await fetchArticles(selectedCategory, page);
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新エラー');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleFavoriteToggle = async (e: React.MouseEvent, article: Article) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/articles/${article.id}/favorite`, { method: 'POST' });
      if (!res.ok) return;
      const { is_favorite } = await res.json();
      setArticles((prev) =>
        prev.map((a) => (a.id === article.id ? { ...a, is_favorite } : a))
      );
    } catch {
      // Silently fail
    }
  };

  const handleArticleClick = async (article: Article) => {
    // Mark as read
    if (!article.is_read) {
      try {
        await fetch(`/api/articles/${article.id}/read`, { method: 'POST' });
        setArticles((prev) =>
          prev.map((a) => (a.id === article.id ? { ...a, is_read: 1 } : a))
        );
      } catch {
        // Silently fail mark-as-read
      }
    }
    // Open link in new tab
    window.open(article.link, '_blank', 'noopener,noreferrer');
  };

  const totalPages = Math.ceil(total / LIMIT);
  const unreadCount = articles.filter((a) => !a.is_read).length;

  return (
    <div>
      {/* Controls Row */}
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            全 <span className="font-semibold text-gray-700">{total}</span> 件
          </span>
          {unreadCount > 0 && (
            <span className="text-sm bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">
              未読 {unreadCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">
            最終更新: {formatRelativeTime(lastUpdated)}
          </span>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg
              className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {isRefreshing ? '更新中...' : '更新'}
          </button>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => handleCategoryChange(cat)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              selectedCategory === cat
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Articles List */}
      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-4 border border-gray-100 animate-pulse">
              <div className="flex gap-3">
                <div className="w-3 h-3 rounded-full bg-gray-200 mt-1 flex-shrink-0" />
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-1/2 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : articles.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📭</p>
          <p className="text-lg font-medium">記事がありません</p>
          <p className="text-sm mt-1">「更新」ボタンを押してRSSフィードを取得してください</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {articles.map((article) => (
            <div
              key={article.id}
              onClick={() => handleArticleClick(article)}
              className={`w-full text-left bg-white rounded-xl p-4 border transition-all hover:shadow-md hover:border-indigo-200 group cursor-pointer ${
                article.is_read
                  ? 'border-gray-100 opacity-75'
                  : 'border-gray-200 shadow-sm'
              }`}
            >
              <div className="flex gap-3 items-start">
                {/* Unread indicator */}
                <div className="flex-shrink-0 mt-1.5">
                  {article.is_read ? (
                    <span className="text-gray-300 text-sm leading-none">○</span>
                  ) : (
                    <span className="text-indigo-500 text-sm leading-none font-bold">●</span>
                  )}
                </div>

                {/* Thumbnail */}
                <div className="flex-shrink-0 w-16 h-12 rounded overflow-hidden bg-gray-100 flex items-center justify-center">
                  {article.image_url && article.image_url !== '' ? (
                    <img
                      src={article.image_url}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <span className="text-lg font-bold text-gray-400">
                      {article.source_name.charAt(0)}
                    </span>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 mb-1 flex-wrap">
                    <h2
                      className={`text-base leading-snug group-hover:text-indigo-700 transition-colors ${
                        article.is_read
                          ? 'text-gray-500 font-normal'
                          : 'text-gray-800 font-semibold'
                      }`}
                    >
                      {article.title}
                    </h2>
                  </div>

                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        CATEGORY_COLORS[article.category] ?? 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {article.category}
                    </span>
                    <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded">
                      {article.source_name}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatDate(article.published_at)}
                    </span>
                  </div>

                  {article.summary && (
                    <p className="text-sm text-gray-500 line-clamp-3 leading-relaxed">
                      {article.summary}
                    </p>
                  )}
                </div>

                {/* Favorite + External link */}
                <div className="flex-shrink-0 flex items-center gap-1 mt-0.5">
                  <button
                    onClick={(e) => handleFavoriteToggle(e, article)}
                    className={`p-1 rounded transition-colors ${
                      article.is_favorite
                        ? 'text-yellow-400 hover:text-yellow-500'
                        : 'text-gray-200 hover:text-yellow-300 opacity-0 group-hover:opacity-100'
                    }`}
                    title={article.is_favorite ? 'お気に入りを解除' : 'お気に入りに追加'}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill={article.is_favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                  </button>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity text-indigo-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:border-indigo-300 transition-colors"
          >
            前へ
          </button>
          <span className="text-sm text-gray-500">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:border-indigo-300 transition-colors"
          >
            次へ
          </button>
        </div>
      )}
    </div>
  );
}
