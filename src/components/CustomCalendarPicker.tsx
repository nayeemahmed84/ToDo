import { useMemo, useState } from 'react';

interface CustomCalendarPickerProps {
  initialDate?: string | null; // YYYY-MM-DD
  todayStr: string; // YYYY-MM-DD
  withTime?: boolean;
  initialTime?: string; // HH:MM
  onSave: (dateStr: string, timeStr?: string) => void;
  onCancel: () => void;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function CustomCalendarPicker({
  initialDate,
  todayStr,
  withTime = false,
  initialTime = '10:00',
  onSave,
  onCancel,
}: CustomCalendarPickerProps) {
  const [todayY, todayM] = todayStr.split('-').map(Number);
  const baseDate = initialDate || todayStr;
  const [initY, initM] = baseDate.split('-').map(Number);

  const [viewYear, setViewYear] = useState(initY);
  const [viewMonth, setViewMonth] = useState(initM); // 1-12
  const [selectedDate, setSelectedDate] = useState(baseDate >= todayStr ? baseDate : todayStr);
  const [timeStr, setTimeStr] = useState(initialTime);

  const isCurrentMonth = viewYear === todayY && viewMonth === todayM;

  const days = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth - 1, 1).getDay(); // 0=Su
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    const cells: (string | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const mm = String(viewMonth).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      cells.push(`${viewYear}-${mm}-${dd}`);
    }
    return cells;
  }, [viewYear, viewMonth]);

  const monthLabel = new Date(viewYear, viewMonth - 1, 1).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const timeOptions = useMemo(() => {
    const opts: string[] = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 15) {
        opts.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      }
    }
    return opts;
  }, []);

  return (
    <div
      className="custom-calendar-popover"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        boxShadow: 'var(--shadow-menu)',
        padding: '10px',
        width: '240px',
        zIndex: 50,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{monthLabel}</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            type="button"
            disabled={isCurrentMonth}
            onClick={() => {
              if (viewMonth === 1) {
                setViewYear((y) => y - 1);
                setViewMonth(12);
              } else {
                setViewMonth((m) => m - 1);
              }
            }}
            aria-label="Previous month"
            style={{ border: 'none', background: 'transparent', cursor: isCurrentMonth ? 'not-allowed' : 'pointer', opacity: isCurrentMonth ? 0.35 : 1, color: 'var(--text)' }}
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => {
              if (viewMonth === 12) {
                setViewYear((y) => y + 1);
                setViewMonth(1);
              } else {
                setViewMonth((m) => m + 1);
              }
            }}
            aria-label="Next month"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text)' }}
          >
            ↓
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', textAlign: 'center', fontSize: '0.75rem', marginBottom: '4px', color: 'var(--text-2)' }}>
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', textAlign: 'center' }}>
        {days.map((d, i) => {
          if (!d) return <span key={`empty-${i}`} />;
          const disabled = d < todayStr;
          const isSelected = d === selectedDate;
          const isToday = d === todayStr;
          return (
            <button
              key={d}
              type="button"
              disabled={disabled}
              onClick={() => setSelectedDate(d)}
              style={{
                border: isToday && !isSelected ? '1px solid var(--accent)' : 'none',
                borderRadius: '4px',
                padding: '4px 0',
                fontSize: '0.8rem',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.35 : 1,
                background: isSelected ? 'var(--accent)' : 'transparent',
                color: isSelected ? '#fff' : 'var(--text)',
              }}
            >
              {Number(d.split('-')[2])}
            </button>
          );
        })}
      </div>

      {withTime && (
        <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>Time:</label>
          <select
            value={timeStr}
            onChange={(e) => setTimeStr(e.target.value)}
            style={{ flex: 1, fontSize: '0.8rem', padding: '3px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '4px' }}
          >
            {timeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '10px' }}>
        <button type="button" onClick={onCancel} className="chip-btn">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave(selectedDate, withTime ? timeStr : undefined)}
          style={{
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            padding: '4px 12px',
            fontSize: '0.8rem',
            cursor: 'pointer',
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
