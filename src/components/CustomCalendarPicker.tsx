import { useMemo, useState } from 'react';

interface CustomCalendarPickerProps {
  initialDate?: string | null; // YYYY-MM-DD
  todayStr: string; // YYYY-MM-DD
  withTime?: boolean;
  initialTime?: string; // HH:MM
  onSave: (dateStr: string, timeStr?: string) => void;
  onCancel?: () => void;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function CustomCalendarPicker({
  initialDate,
  todayStr,
  withTime = false,
  initialTime = '10:00',
  onSave,
}: CustomCalendarPickerProps) {
  const [todayY, todayM] = todayStr.split('-').map(Number);
  const baseDate = initialDate || todayStr;
  const [initY, initM] = baseDate.split('-').map(Number);

  const [viewYear, setViewYear] = useState(initY);
  const [viewMonth, setViewMonth] = useState(initM); // 1-12
  const [pickerMode, setPickerMode] = useState<'days' | 'months' | 'years'>('days');
  const [yearPageStart, setYearPageStart] = useState(() => Math.floor(initY / 12) * 12);
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
        background: 'var(--color-calendar-bg)',
        border: '1px solid var(--color-border)',
        borderRadius: '6px',
        boxShadow: 'var(--shadow-menu)',
        padding: '14px',
        width: '305px',
        zIndex: 50,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <button
          type="button"
          onClick={() => {
            if (pickerMode === 'days') setPickerMode('months');
            else if (pickerMode === 'months') {
              setYearPageStart(Math.floor(viewYear / 12) * 12);
              setPickerMode('years');
            } else setPickerMode('days');
          }}
          style={{
            border: 'none',
            background: 'transparent',
            fontWeight: 600,
            fontSize: '16px',
            color: 'var(--color-text)',
            cursor: 'pointer',
            padding: '4px 6px',
            borderRadius: '4px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
          title={pickerMode === 'days' ? 'Choose month & year' : pickerMode === 'months' ? 'Choose year' : 'Back to days'}
        >
          <span>
            {pickerMode === 'days'
              ? monthLabel
              : pickerMode === 'months'
                ? String(viewYear)
                : `${yearPageStart}–${yearPageStart + 11}`}
          </span>
          <span style={{ fontSize: '11px', opacity: 0.7 }}>{pickerMode === 'years' ? '▴' : '▾'}</span>
        </button>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            disabled={
              pickerMode === 'days'
                ? isCurrentMonth
                : pickerMode === 'months'
                  ? viewYear <= todayY
                  : yearPageStart <= todayY
            }
            onClick={() => {
              if (pickerMode === 'days') {
                if (viewMonth === 1) {
                  setViewYear((y) => y - 1);
                  setViewMonth(12);
                } else {
                  setViewMonth((m) => m - 1);
                }
              } else if (pickerMode === 'months') {
                setViewYear((y) => Math.max(todayY, y - 1));
              } else {
                setYearPageStart((s) => Math.max(Math.floor(todayY / 12) * 12, s - 12));
              }
            }}
            aria-label={pickerMode === 'days' ? 'Previous month' : pickerMode === 'months' ? 'Previous year' : 'Previous years'}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: '18px',
              cursor: (pickerMode === 'days' ? isCurrentMonth : pickerMode === 'months' ? viewYear <= todayY : yearPageStart <= todayY) ? 'not-allowed' : 'pointer',
              opacity: (pickerMode === 'days' ? isCurrentMonth : pickerMode === 'months' ? viewYear <= todayY : yearPageStart <= todayY) ? 0.35 : 1,
              color: 'var(--color-text)',
            }}
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => {
              if (pickerMode === 'days') {
                if (viewMonth === 12) {
                  setViewYear((y) => y + 1);
                  setViewMonth(1);
                } else {
                  setViewMonth((m) => m + 1);
                }
              } else if (pickerMode === 'months') {
                setViewYear((y) => y + 1);
              } else {
                setYearPageStart((s) => s + 12);
              }
            }}
            aria-label={pickerMode === 'days' ? 'Next month' : pickerMode === 'months' ? 'Next year' : 'Next years'}
            style={{ border: 'none', background: 'transparent', fontSize: '18px', cursor: 'pointer', color: 'var(--color-text)' }}
          >
            →
          </button>
        </div>
      </div>

      {pickerMode === 'years' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '6px' }}>
          {Array.from({ length: 12 }, (_, idx) => yearPageStart + idx).map((yr) => {
            const disabled = yr < todayY;
            const isSelected = yr === viewYear;
            return (
              <button
                key={yr}
                type="button"
                disabled={disabled}
                onClick={() => {
                  setViewYear(yr);
                  if (yr === todayY && viewMonth < todayM) setViewMonth(todayM);
                  setPickerMode('months');
                }}
                style={{
                  height: '44px',
                  border: yr === todayY && !isSelected ? '1px solid var(--color-accent)' : 'none',
                  borderRadius: '6px',
                  background: isSelected ? 'var(--color-accent)' : 'transparent',
                  color: isSelected ? 'var(--color-text-inverse)' : 'var(--color-text)',
                  fontSize: '14px',
                  fontWeight: isSelected ? 600 : 400,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.35 : 1,
                }}
              >
                {yr}
              </button>
            );
          })}
        </div>
      )}

      {pickerMode === 'months' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '6px' }}>
          {MONTHS_SHORT.map((label, idx) => {
            const monthNum = idx + 1;
            const disabled = viewYear === todayY && monthNum < todayM;
            const isSelected = monthNum === viewMonth;
            return (
              <button
                key={label}
                type="button"
                disabled={disabled}
                onClick={() => {
                  setViewMonth(monthNum);
                  setPickerMode('days');
                }}
                style={{
                  height: '44px',
                  border: viewYear === todayY && monthNum === todayM && !isSelected ? '1px solid var(--color-accent)' : 'none',
                  borderRadius: '6px',
                  background: isSelected ? 'var(--color-accent)' : 'transparent',
                  color: isSelected ? 'var(--color-text-inverse)' : 'var(--color-text)',
                  fontSize: '14px',
                  fontWeight: isSelected ? 600 : 400,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.35 : 1,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {pickerMode === 'days' && (
      <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', textAlign: 'center', fontSize: '14px', marginBottom: '6px', color: 'var(--color-text-2)' }}>
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', textAlign: 'center', justifyItems: 'center' }}>
        {days.map((d, i) => {
          if (!d) return <span key={`empty-${i}`} style={{ width: '38px', height: '38px' }} />;
          const disabled = d < todayStr;
          const isSelected = d === selectedDate;
          const isToday = d === todayStr;
          return (
            <button
              key={d}
              type="button"
              disabled={disabled}
              onClick={() => {
                setSelectedDate(d);
                onSave(d, withTime ? timeStr : undefined);
              }}
              style={{
                width: isToday || isSelected ? '36px' : '38px',
                height: isToday || isSelected ? '36px' : '38px',
                border: isToday && !isSelected ? '1px solid var(--color-accent)' : 'none',
                borderRadius: isToday || isSelected ? '50%' : '4px',
                padding: 0,
                fontSize: '15px',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.35 : 1,
                background: isSelected || isToday ? 'var(--color-accent)' : 'transparent',
                color: isSelected || isToday ? 'var(--color-text-inverse)' : 'var(--color-text)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {Number(d.split('-')[2])}
            </button>
          );
        })}
      </div>
      </>
      )}

      {withTime && (
        <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '0.8rem', color: 'var(--color-text-2)' }}>Time:</label>
          <select
            value={timeStr}
            onChange={(e) => setTimeStr(e.target.value)}
            style={{ flex: 1, fontSize: '0.8rem', padding: '3px', background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: '4px' }}
          >
            {timeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      )}


    </div>
  );
}
