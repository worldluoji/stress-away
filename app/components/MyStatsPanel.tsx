'use client';

import { useState, useEffect, useCallback } from 'react';

interface ScenarioStat {
  scenarioId: string;
  count: number;
}

interface KeywordStat {
  keyword: string;
  count: number;
}

interface DailyActivity {
  date: string;
  count: number;
  label: string;
}

interface UserStats {
  totalChats: number;
  activeDays: number;
  scenarios: ScenarioStat[];
  keywords: KeywordStat[];
  weeklyActivity: DailyActivity[];
}

interface MyStatsPanelProps {
  onClose: () => void;
}

// Map scenario IDs to friendly names
const SCENARIO_NAMES: Record<string, string> = {
  'leader-dismiss': '领导打压/否定',
  'leader-assign': '领导派活太多',
  'leader-credit': '领导抢功',
  'colleague-trap': '同事挖坑',
  'salary-cut': '降薪/扣工资',
  'work-overtime': '强制加班',
  'promotion-block': '晋升受阻',
  'exclude-meeting': '被排挤/冷落',
  'performance-low': '绩效被打低',
  'laid-off-threat': '变相裁员',
};

export function MyStatsPanel({ onClose }: MyStatsPanelProps) {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats');
      if (res.status === 401) {
        setError('请先登录');
        return;
      }
      if (!res.ok) throw new Error('获取数据失败');
      const data = await res.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  const getScenarioName = (id: string) => SCENARIO_NAMES[id] || id;

  const getMaxCount = (items: { count: number }[]) =>
    Math.max(...items.map(i => i.count), 1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md mx-4 max-h-[85vh] bg-white dark:bg-[--card-bg] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[--border]">
          <h2 className="text-lg font-semibold text-[--foreground]">我的数据</h2>
          <button onClick={onClose} className="p-1 text-[--foreground-tertiary] hover:text-[--foreground]">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <span className="text-[--foreground-tertiary]">加载中...</span>
            </div>
          )}

          {error && (
            <div className="text-center py-12">
              <p className="text-[--foreground-tertiary]">{error}</p>
            </div>
          )}

          {!loading && !error && stats && (
            <div className="space-y-6">
              {/* Summary stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[--background-secondary] rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-[--foreground]">{stats.totalChats}</div>
                  <div className="text-xs text-[--foreground-tertiary] mt-1">总对话数</div>
                </div>
                <div className="bg-[--background-secondary] rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-[--foreground]">{stats.activeDays}</div>
                  <div className="text-xs text-[--foreground-tertiary] mt-1">活跃天数</div>
                </div>
              </div>

              {/* Weekly activity */}
              {stats.weeklyActivity.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-[--foreground-secondary] mb-3">本周活跃</h3>
                  <div className="flex items-end gap-1.5 h-16">
                    {stats.weeklyActivity.map((day) => (
                      <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                        <div
                          className="w-full rounded-sm bg-[#007AFF]/80 transition-all"
                          style={{ height: `${Math.max((day.count / 5) * 48, day.count > 0 ? 8 : 4)}px` }}
                        />
                        <span className="text-[10px] text-[--foreground-tertiary]">{day.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Scenario distribution */}
              {stats.scenarios.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-[--foreground-secondary] mb-3">话题分布</h3>
                  <div className="space-y-2">
                    {stats.scenarios.map((s) => {
                      const pct = Math.round((s.count / getMaxCount(stats.scenarios)) * 100);
                      return (
                        <div key={s.scenarioId} className="flex items-center gap-3">
                          <span className="text-sm text-[--foreground] w-28 truncate">
                            {getScenarioName(s.scenarioId)}
                          </span>
                          <div className="flex-1 h-2 bg-[--background-secondary] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#007AFF] rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-[--foreground-tertiary] w-8 text-right">{s.count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Keywords */}
              {stats.keywords.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-[--foreground-secondary] mb-3">高频关键词</h3>
                  <div className="flex flex-wrap gap-2">
                    {stats.keywords.map((kw) => (
                      <span
                        key={kw.keyword}
                        className="px-3 py-1.5 bg-[--background-secondary] rounded-full text-xs text-[--foreground-secondary]"
                      >
                        {kw.keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {stats.totalChats === 0 && (
                <div className="text-center py-8">
                  <svg className="w-12 h-12 mx-auto mb-3 text-[--foreground-tertiary]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <p className="text-[--foreground-tertiary]">开始对话后，这里会显示你的数据</p>
                  <p className="text-xs text-[--foreground-tertiary] mt-1">记录越多，分析越准</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}