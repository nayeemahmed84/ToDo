import { useEffect, useMemo } from 'react';
import { TodoItem } from '../types/todo';
import { EmojiText } from '../lib/emoji';

interface InsightsModalProps {
  items: TodoItem[];
  todayStr: string;
  tomorrowStr: string;
  onRolloverToTomorrow: (itemIds: string[]) => Promise<void> | void;
  onMoveToMyDay: (itemIds: string[]) => Promise<void> | void;
  onClose: () => void;
}

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function InsightsModal({
  items,
  todayStr,
  tomorrowStr,
  onRolloverToTomorrow,
  onMoveToMyDay,
  onClose,
}: InsightsModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const stats = useMemo(() => {
    const active = items.filter((i) => !i.deletedAtMs);
    const completedByDay = new Map<string, number>();
    let totalFocusMinutes = 0;

    for (const item of active) {
      totalFocusMinutes += item.focusMinutes ?? 0;
      if (item.done && item.completedAtMs) {
        const ymd = toYmd(new Date(item.completedAtMs));
        completedByDay.set(ymd, (completedByDay.get(ymd) ?? 0) + 1);
      }
    }

    // Last 7 days bar chart
    const last7: { ymd: string; label: string; count: number }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const ymd = toYmd(d);
      last7.push({
        ymd,
        label: d.toLocaleDateString('en-US', { weekday: 'short' }),
        count: completedByDay.get(ymd) ?? 0,
      });
    }
    const maxDayCount = Math.max(1, ...last7.map((d) => d.count));

    // Current streak
    let currentStreak = 0;
    const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // If none completed today yet, start checking from yesterday so streak isn't prematurely 0
    if ((completedByDay.get(toYmd(cursor)) ?? 0) === 0) {
      cursor.setDate(cursor.getDate() - 1);
    }
    while ((completedByDay.get(toYmd(cursor)) ?? 0) > 0) {
      currentStreak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    const myDayAll = active.filter((i) => i.myDayDate === todayStr);
    const myDayDone = myDayAll.filter((i) => i.done);
    const myDayUnfinished = myDayAll.filter((i) => !i.done);
    const overdue = active.filter((i) => !i.done && i.dueDate && i.dueDate < todayStr);
    const completedToday = completedByDay.get(todayStr) ?? 0;
    const completedThisWeek = last7.reduce((sum, d) => sum + d.count, 0);

    return {
      last7,
      maxDayCount,
      currentStreak,
      completedToday,
      completedThisWeek,
      totalFocusMinutes,
      myDayRate: myDayAll.length ? Math.round((myDayDone.length / myDayAll.length) * 100) : 0,
      myDayTotal: myDayAll.length,
      myDayDoneCount: myDayDone.length,
      myDayUnfinished,
      overdue,
    };
  }, [items, todayStr]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card insights-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Daily Review and Insights"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="insights-header">
          <div>
            <h2>Daily Review &amp; Insights</h2>
            <p className="insights-sub">Track your momentum and roll over unfinished tasks.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close insights">
            ×
          </button>
        </div>

        <div className="insights-kpi-grid">
          <div className="insights-kpi-card">
            <span className="insights-kpi-value">{stats.currentStreak}d</span>
            <span className="insights-kpi-label">Current Streak</span>
          </div>
          <div className="insights-kpi-card">
            <span className="insights-kpi-value">{stats.completedToday}</span>
            <span className="insights-kpi-label">Done Today</span>
          </div>
          <div className="insights-kpi-card">
            <span className="insights-kpi-value">{stats.myDayRate}%</span>
            <span className="insights-kpi-label">
              My Day ({stats.myDayDoneCount}/{stats.myDayTotal})
            </span>
          </div>
          <div className="insights-kpi-card">
            <span className="insights-kpi-value">{stats.totalFocusMinutes}m</span>
            <span className="insights-kpi-label">Focus Logged</span>
          </div>
        </div>

        <div className="insights-section">
          <div className="insights-section-head">
            <h3>Last 7 Days</h3>
            <span>{stats.completedThisWeek} completed</span>
          </div>
          <div className="insights-chart" role="img" aria-label="Tasks completed over the last 7 days">
            {stats.last7.map((d) => {
              const heightPct = Math.max(6, Math.round((d.count / stats.maxDayCount) * 100));
              const isToday = d.ymd === todayStr;
              return (
                <div key={d.ymd} className={`insights-bar-col ${isToday ? 'today' : ''}`}>
                  <span className="insights-bar-num">{d.count}</span>
                  <div className="insights-bar-track">
                    <div className="insights-bar-fill" style={{ height: `${heightPct}%` }} />
                  </div>
                  <span className="insights-bar-day">{d.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="insights-section">
          <div className="insights-section-head">
            <h3>Unfinished My Day ({stats.myDayUnfinished.length})</h3>
            {stats.myDayUnfinished.length > 0 && (
              <button
                type="button"
                className="chip-btn insights-action-btn"
                onClick={() => void onRolloverToTomorrow(stats.myDayUnfinished.map((i) => i.id))}
              >
                Roll all to Tomorrow ({tomorrowStr})
              </button>
            )}
          </div>
          {stats.myDayUnfinished.length === 0 ? (
            <div className="insights-empty">All My Day tasks are complete! Great work.</div>
          ) : (
            <ul className="insights-rollover-list">
              {stats.myDayUnfinished.slice(0, 8).map((t) => (
                <li key={t.id} className="insights-rollover-item">
                  <span className="insights-rollover-title"><EmojiText text={t.text} /></span>
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => void onRolloverToTomorrow([t.id])}
                  >
                    Tomorrow
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {stats.overdue.length > 0 && (
          <div className="insights-section">
            <div className="insights-section-head">
              <h3>Overdue Tasks ({stats.overdue.length})</h3>
              <button
                type="button"
                className="chip-btn insights-action-btn"
                onClick={() => void onMoveToMyDay(stats.overdue.map((i) => i.id))}
              >
                Pull into My Day
              </button>
            </div>
            <ul className="insights-rollover-list">
              {stats.overdue.slice(0, 6).map((t) => (
                <li key={t.id} className="insights-rollover-item">
                  <span className="insights-rollover-title">
                    <EmojiText text={t.text} />
                    <small className="insights-overdue-date">Due {t.dueDate}</small>
                  </span>
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => void onMoveToMyDay([t.id])}
                  >
                    Today
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
