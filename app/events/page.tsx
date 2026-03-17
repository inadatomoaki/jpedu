'use client';

import { useState, useEffect, useCallback } from 'react';

interface Event {
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

interface EventsResponse {
  events: Event[];
  organizers: string[];
}

// 主催者ごとのカラー
const ORGANIZER_COLORS: Record<string, string> = {
  '日本語教育学会': 'bg-blue-500',
  '9640.jp': 'bg-green-500',
  '凡人社': 'bg-purple-500',
  'UALS': 'bg-orange-500',
  'JACTFL': 'bg-red-500',
  '国立国語研究所': 'bg-teal-500',
};
const ORGANIZER_LIGHT: Record<string, string> = {
  '日本語教育学会': 'bg-blue-50 border-blue-200 text-blue-800',
  '9640.jp': 'bg-green-50 border-green-200 text-green-800',
  '凡人社': 'bg-purple-50 border-purple-200 text-purple-800',
  'UALS': 'bg-orange-50 border-orange-200 text-orange-800',
  'JACTFL': 'bg-red-50 border-red-200 text-red-800',
  '国立国語研究所': 'bg-teal-50 border-teal-200 text-teal-800',
};
const DEFAULT_DOT = 'bg-indigo-400';
const DEFAULT_LIGHT = 'bg-indigo-50 border-indigo-200 text-indigo-800';

function dotColor(organizer: string | null): string {
  return organizer ? (ORGANIZER_COLORS[organizer] ?? DEFAULT_DOT) : DEFAULT_DOT;
}
function lightColor(organizer: string | null): string {
  return organizer ? (ORGANIZER_LIGHT[organizer] ?? DEFAULT_LIGHT) : DEFAULT_LIGHT;
}

// イベントが対象日付にかかるか（start〜end範囲チェック）
function eventCoversDay(event: Event, year: number, month: number, day: number): boolean {
  if (!event.event_date) return false;
  const target = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const start = event.event_date;
  const end = event.event_date_end || event.event_date;
  return target >= start && target <= end;
}

// イベントがこの月に含まれるか
function eventInMonth(event: Event, year: number, month: number): boolean {
  if (!event.event_date) return false;
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-31`;
  const start = event.event_date;
  const end = event.event_date_end || event.event_date;
  return start <= monthEnd && end >= monthStart;
}

function MonthCalendar({
  year,
  month,
  events,
  todayStr,
}: {
  year: number;
  month: number;
  events: Event[];
  todayStr: string;
}) {
  const monthEvents = events
    .filter((e) => eventInMonth(e, year, month))
    .sort((a, b) => (a.event_date || '').localeCompare(b.event_date || ''));

  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startDow = firstDay.getDay(); // 0=Sun
  const offset = startDow === 0 ? 6 : startDow - 1; // 月曜スタート

  const cells: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = `${year}年${month}月`;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* ヘッダー */}
      <div className="bg-indigo-600 px-5 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">{monthLabel}</h2>
          <p className="text-indigo-200 text-sm mt-0.5">
            {monthEvents.length > 0 ? `${monthEvents.length}件のイベント` : 'イベントなし'}
          </p>
        </div>
      </div>

      {/* カレンダーグリッド */}
      <div className="p-4 pb-2">
        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7 mb-1">
          {['月', '火', '水', '木', '金', '土', '日'].map((d, i) => (
            <div
              key={d}
              className={`text-center text-xs font-semibold py-1 ${
                i === 5 ? 'text-blue-500' : i === 6 ? 'text-red-500' : 'text-gray-400'
              }`}
            >
              {d}
            </div>
          ))}
        </div>

        {/* 日付グリッド */}
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((day, i) => {
            if (!day) return <div key={`empty-${i}`} className="h-10" />;

            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday = dateStr === todayStr;
            const dow = i % 7; // 0=月...6=日
            const dayEvents = monthEvents.filter((e) => eventCoversDay(e, year, month, day));

            return (
              <div
                key={day}
                className={`relative h-10 rounded flex flex-col items-center pt-0.5 ${
                  isToday ? 'bg-indigo-50 ring-1 ring-indigo-400' : ''
                }`}
              >
                <span
                  className={`text-xs font-medium ${
                    isToday
                      ? 'text-indigo-700 font-bold'
                      : dow === 5
                      ? 'text-blue-500'
                      : dow === 6
                      ? 'text-red-500'
                      : 'text-gray-700'
                  }`}
                >
                  {day}
                </span>
                {/* イベントドット */}
                {dayEvents.length > 0 && (
                  <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center max-w-full px-0.5">
                    {dayEvents.slice(0, 3).map((e) => (
                      <span
                        key={e.id}
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor(e.organizer)}`}
                      />
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="text-[8px] text-gray-400 leading-none">+{dayEvents.length - 3}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* イベント一覧 */}
      {monthEvents.length > 0 ? (
        <div className="border-t border-gray-100 mt-2 divide-y divide-gray-50">
          {monthEvents.map((event) => {
            const light = lightColor(event.organizer);
            return (
              <div key={event.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                <div className="flex items-start gap-3">
                  {/* 日付 */}
                  <div className="flex-shrink-0 text-center w-10">
                    {event.event_date && (
                      <>
                        <div className="text-lg font-bold text-gray-800 leading-none">
                          {parseInt(event.event_date.slice(8, 10))}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          {['日', '月', '火', '水', '木', '金', '土'][
                            new Date(event.event_date + 'T00:00:00').getDay()
                          ]}
                        </div>
                      </>
                    )}
                    {event.event_date_end && event.event_date_end !== event.event_date && (
                      <div className="text-[10px] text-gray-400">
                        〜{parseInt(event.event_date_end.slice(8, 10))}日
                      </div>
                    )}
                  </div>

                  {/* 詳細 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      {event.organizer && (
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${light}`}
                        >
                          {event.organizer}
                        </span>
                      )}
                      <span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                        {event.event_type}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-gray-800 leading-snug">{event.title}</h3>
                    {event.venue && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        📍 {event.venue}
                      </p>
                    )}
                    {event.deadline && (
                      <p className="text-xs text-orange-600 mt-0.5">
                        締切: {event.deadline}
                      </p>
                    )}
                  </div>

                  {/* 詳細リンク */}
                  {event.url && (
                    <a
                      href={event.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 flex items-center gap-1 text-xs text-indigo-600 border border-indigo-200 rounded-lg px-2.5 py-1.5 hover:bg-indigo-50 transition-colors font-medium"
                    >
                      詳細
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-5 py-6 text-center text-gray-400 text-sm">この月のイベントはありません</div>
      )}
    </div>
  );
}

// 凡例
function Legend() {
  return (
    <div className="flex flex-wrap gap-3">
      {Object.entries(ORGANIZER_COLORS).map(([org, color]) => (
        <div key={org} className="flex items-center gap-1.5 text-xs text-gray-600">
          <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
          {org}
        </div>
      ))}
    </div>
  );
}

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // 今月から6か月分の [year, month] 配列
  const months: [number, number][] = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    return [d.getFullYear(), d.getMonth() + 1];
  });

  const fetchEvents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // upcoming=false で全件取得し、クライアントでフィルタ
      const res = await fetch('/api/events?upcoming=false');
      if (!res.ok) throw new Error('データの取得に失敗しました');
      const data: EventsResponse = await res.json();
      setEvents(data.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラー');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const res = await fetch('/api/events/refresh', { method: 'POST' });
      if (!res.ok) throw new Error('更新に失敗しました');
      await fetchEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新エラー');
    } finally {
      setIsRefreshing(false);
    }
  };

  // 6か月の範囲でフィルタ
  const [rangeStart] = months[0];
  const [rangeEndY, rangeEndM] = months[months.length - 1];
  const rangeStartStr = `${rangeStart}-${String(months[0][1]).padStart(2, '0')}-01`;
  const rangeEndStr = `${rangeEndY}-${String(rangeEndM).padStart(2, '0')}-31`;

  const filteredEvents = events.filter((e) => {
    if (!e.event_date) return false;
    const end = e.event_date_end || e.event_date;
    return e.event_date <= rangeEndStr && end >= rangeStartStr;
  });

  const totalCount = filteredEvents.length;

  return (
    <div>
      {/* コントロールバー */}
      <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-gray-800">学会・イベントカレンダー</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {months[0][0]}年{months[0][1]}月 〜 {months[months.length - 1][0]}年{months[months.length - 1][1]}月
            {!isLoading && (
              <span className="ml-2 font-semibold text-gray-700">{totalCount}件</span>
            )}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing || isLoading}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
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
          {isRefreshing ? '取得中...' : '最新情報を取得'}
        </button>
      </div>

      {/* 凡例 */}
      <div className="mb-5 p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
        <Legend />
      </div>

      {/* エラー */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* カレンダー */}
      {isLoading ? (
        <div className="flex flex-col gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-200 overflow-hidden animate-pulse">
              <div className="bg-indigo-200 h-16" />
              <div className="p-4 space-y-2">
                <div className="h-3 bg-gray-100 rounded w-full" />
                <div className="h-3 bg-gray-100 rounded w-3/4" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : totalCount === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-5xl mb-4">📅</p>
          <p className="text-lg font-medium text-gray-500">イベント情報がありません</p>
          <p className="text-sm mt-2">「最新情報を取得」ボタンを押してデータを収集してください</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {months.map(([y, m]) => (
            <MonthCalendar
              key={`${y}-${m}`}
              year={y}
              month={m}
              events={filteredEvents}
              todayStr={todayStr}
            />
          ))}
        </div>
      )}
    </div>
  );
}
