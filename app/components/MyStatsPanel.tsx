'use client';

import { useState, useEffect } from 'react';
import { useAuth } from './LoginModal';
import { apiFetch } from '@/lib/request-api';
import { Icon } from './ui/Icon';
import { Spinner } from './ui/Spinner';
import { EmptyState } from './ui/EmptyState';

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
  const { uid } = useAuth();
  const [stats, setStats] = useState<UserStats>({
    totalChats: 0,
    activeDays: 0,
    scenarios: [],
    keywords: [],
    weeklyActivity: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (uid) fetchStats();
  }, [uid]);

  const fetchStats = async () => {
    try {
      const res = await apiFetch('/api/stats', {
        headers: uid ? { 'X-User-Id': uid } : {},
      });
      if (res.status === 401 || !uid) {
        setError('请先登录');
        return;
      }
      const data = await res.json();
      setStats(data);
      setError(null);
    } catch {
      setStats({ totalChats: 0, activeDays: 0, scenarios: [], keywords: [], weeklyActivity: [] });
      setError(null);
    } finally {
      setLoading(false);
    }
  };

  const getScenarioName = (id: string) => SCENARIO_NAMES[id] || id;

  const getMaxCount = (items: { count: number }[]) =>
    Math.max(...(items || []).map(i => i.count), 1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md mx-4 max-h-[85vh] bg-[var(--card-bg)] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-scale-in border border-[var(--card-border)]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--card-border)]">
          <h2 className="text-[var(--text-h3)] font-semibold text-[var(--foreground)]">我的数据</h2>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="w-8 h-8 flex items-center justify-center rounded-full text-[var(--foreground-tertiary)] hover:bg-[var(--background-secondary)] hover:text-[var(--foreground)] transition-all active:scale-95"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Spinner label="加载中…" />
            </div>
          )}

          {error && (
            <div className="text-center py-12">
              <p className="text-[var(--foreground-tertiary)]">{error}</p>
            </div>
          )}

          {!loading && !error && stats && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[var(--background-secondary)] rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-[var(--foreground)]">{stats.totalChats}</div>
                  <div className="text-xs text-[var(--foreground-tertiary)] mt-1">总对话数</div>
                </div>
                <div className="bg-[var(--background-secondary)] rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-[var(--foreground)]">{stats.activeDays}</div>
                  <div className="text-xs text-[var(--foreground-tertiary)] mt-1">活跃天数</div>
                </div>
              </div>

              {(stats.weeklyActivity || []).length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-[var(--foreground-secondary)] mb-3">本周活跃</h3>
                  <div className="flex items-end gap-1.5 h-16">
                    {(stats.weeklyActivity || []).map((day) => (
                      <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                        <div
                          className="w-full rounded-sm bg-gradient-to-t from-[var(--color-brand)] to-[var(--color-brand-alt)] transition-all"
                          style={{ height: `${Math.max((day.count / 5) * 48, day.count > 0 ? 8 : 4)}px` }}
                        />
                        <span className="text-[10px] text-[var(--foreground-tertiary)]">{day.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(stats.scenarios || []).length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-[var(--foreground-secondary)] mb-3">话题分布</h3>
                  <div className="space-y-2">
                    {(stats.scenarios || []).map((s) => {
                      const pct = Math.round((s.count / getMaxCount(stats.scenarios || [])) * 100);
                      return (
                        <div key={s.scenarioId} className="flex items-center gap-3">
                          <span className="text-sm text-[var(--foreground)] w-28 truncate">
                            {getScenarioName(s.scenarioId)}
                          </span>
                          <div className="flex-1 h-2 bg-[var(--background-secondary)] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-[var(--color-brand)] to-[var(--color-brand-alt)] rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-[var(--foreground-tertiary)] w-8 text-right">{s.count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {(stats.keywords || []).length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-[var(--foreground-secondary)] mb-3">高频关键词</h3>
                  <div className="flex flex-wrap gap-2">
                    {(stats.keywords || []).map((kw) => (
                      <span
                        key={kw.keyword}
                        className="px-3 py-1.5 bg-[var(--background-secondary)] rounded-full text-xs text-[var(--foreground-secondary)]"
                      >
                        {kw.keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {stats.totalChats === 0 && (
                <EmptyState
                  icon="trending-up"
                  title="开始对话后，这里会显示你的数据"
                  description="记录越多，分析越准"
                />
              )}
            </div>
          )}

          <div className="text-center pt-4 mt-4 border-t border-[var(--card-border)]">
            <p className="text-xs text-[var(--foreground-tertiary)]">
              遇到问题？联系客服微信 <span className="text-[var(--color-brand)]">jmst_cute</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
