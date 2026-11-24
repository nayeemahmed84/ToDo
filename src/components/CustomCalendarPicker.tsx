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

function getCurrentTimeHHMM(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export function CustomCalendarPicker({
  initialDate,
  todayStr,
  withTime = false,
  initialTime,
  onSave,
  onCancel,
}: CustomCalendarPickerProps) {
  const resolvedInitialTime = initialTime ?? getCurrentTimeHHMM();
  const [todayY, todayM] = todayStr.split('-').map(Number);
  const baseDate = initialDate || todayStr;
  const [initY, initM] = baseDate.split('-').map(Number);

  const [viewYear, setViewYear] = useState(initY);
  const [viewMonth, setViewMonth] = useState(initM); // 1-12
  const [pickerMode, setPickerMode] = useState<'days' | 'months' | 'years'>('days');
  const [yearPageStart, setYearPageStart] = useState(() => Math.floor(initY / 12) * 12);
  const [selectedDate, setSelectedDate] = useState(baseDate >= todayStr ? baseDate : todayStr);

  const [initH24, initMin] = resolvedInitialTime.split(':').map((n) => Number(n) || 0);
  const [hourInput, setHourInput] = useState(() => String(initH24 % 12 === 0 ? 12 : initH24 % 12));
  const [minuteInput, setMinuteInput] = useState(() => String(initMin).padStart(2, '0'));
  const [ampm, setAmpm] = useState<'AM' | 'PM'>(() => (initH24 >= 12 ? 'PM' : 'AM'));

  const get24HourTime = () => {
    const hNum = Math.max(1, Math.min(12, parseInt(hourInput, 10) || 12));
    const mNum = Math.max(0, Math.min(59, parseInt(minuteInput, 10) || 0));
    const h24 = ampm === 'PM' ? (hNum === 12 ? 12 : hNum + 12) : hNum === 12 ? 0 : hNum;
    return `${String(h24).padStart(2, '0')}:${String(mNum).padStart(2, '0')}`;
  };

  const isCurrentMonth = viewYear === todayY && viewMonth === todayM;

  const days = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth - 1, 1).getDay(); // 0=Su
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    const cells: { ymd: string; inMonth: boolean }[] = [];
    for (let i = 0; i < firstDay; i++) {
      const prevDt = new Date(viewYear, viewMonth - 1, -(firstDay - 1 - i));
      const py = prevDt.getFullYear();
      const pm = String(prevDt.getMonth() + 1).padStart(2, '0');
      const pd = String(prevDt.getDate()).padStart(2, '0');
      cells.push({ ymd: `${py}-${pm}-${pd}`, inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const mm = String(viewMonth).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      cells.push({ ymd: `${viewYear}-${mm}-${dd}`, inMonth: true });
    }
    for (let d = 1; cells.length < 42; d++) {
      const nextDt = new Date(viewYear, viewMonth, d);
      const ny = nextDt.getFullYear();
      const nm = String(nextDt.getMonth() + 1).padStart(2, '0');
      const nd = String(nextDt.getDate()).padStart(2, '0');
      cells.push({ ymd: `${ny}-${nm}-${nd}`, inMonth: false });
    }
    return cells;
  }, [viewYear, viewMonth]);

  const monthLabel = `${new Date(viewYear, viewMonth - 1, 1).toLocaleString('en-US', {
    month: 'long',
  })}, ${viewYear}`;

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
        {days.map(({ ymd: d, inMonth }) => {
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
              }}
              style={{
                width: '36px',
                height: '36px',
                border: isToday && !isSelected
                  ? '1px solid var(--color-accent)'
                  : isSelected
                    ? '2px solid #7ab8f5'
                    : 'none',
                borderRadius: '4px',
                padding: isSelected ? '2px' : 0,
                fontSize: '14px',
                fontWeight: isSelected ? 600 : 400,
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.35 : inMonth ? 1 : 0.6,
                background: isSelected ? '#7ab8f5' : 'transparent',
                backgroundClip: isSelected ? 'content-box' : undefined,
                color: isSelected ? '#111111' : 'var(--color-text)',
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
        <div style={{ marginTop: '12px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              height: '36px',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.06)',
              overflow: 'hidden',
            }}
          >
            <input
              type="text"
              inputMode="numeric"
              aria-label="Hour"
              maxLength={2}
              value={hourInput}
              onChange={(e) => setHourInput(e.target.value.replace(/\D/g, '').slice(0, 2))}
              onBlur={() => {
                const h = Math.max(1, Math.min(12, parseInt(hourInput, 10) || 12));
                setHourInput(String(h));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onSave(selectedDate, get24HourTime());
                }
              }}
              style={{
                width: '100%',
                border: 'none',
                borderRight: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'transparent',
                color: 'var(--color-text)',
                textAlign: 'center',
                fontSize: '14px',
                outline: 'none',
                padding: 0,
              }}
            />
            <input
              type="text"
              inputMode="numeric"
              aria-label="Minute"
              maxLength={2}
              value={minuteInput}
              onChange={(e) => setMinuteInput(e.target.value.replace(/\D/g, '').slice(0, 2))}
              onBlur={() => {
                const m = Math.max(0, Math.min(59, parseInt(minuteInput, 10) || 0));
                setMinuteInput(String(m).padStart(2, '0'));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onSave(selectedDate, get24HourTime());
                }
              }}
              style={{
                width: '100%',
                border: 'none',
                borderRight: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'transparent',
                color: 'var(--color-text)',
                textAlign: 'center',
                fontSize: '14px',
                outline: 'none',
                padding: 0,
              }}
            />
            <button
              type="button"
              aria-label="Toggle AM or PM"
              onClick={() => setAmpm((prev) => (prev === 'AM' ? 'PM' : 'AM'))}
              style={{
                width: '100%',
                border: 'none',
                background: 'transparent',
                color: 'var(--color-text)',
                textAlign: 'center',
                fontSize: '14px',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {ampm}
            </button>
          </div>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px',
          marginTop: '12px',
        }}
      >
        <button
          type="button"
          onClick={() => onCancel?.()}
          style={{
            height: '38px',
            border: 'none',
            borderRadius: '6px',
            background: 'rgba(128, 128, 128, 0.18)',
            color: 'var(--color-text)',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave(selectedDate, withTime ? get24HourTime() : undefined)}
          style={{
            height: '38px',
            border: 'none',
            borderRadius: '6px',
            background: '#77d33d',
            color: '#111111',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Save
        </button>
      </div>


    </div>
  );
}
