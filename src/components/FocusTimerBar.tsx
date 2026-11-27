import { useEffect, useRef, useState } from 'react';
import { TodoItem } from '../types/todo';
import { playFocusCompleteSound } from '../lib/sound';
import { EmojiText } from '../lib/emoji';

type FocusMode = 'focus' | 'short-break' | 'long-break';

const STORAGE_KEY = 'todo.focusDurationsMin';

const DEFAULT_DURATIONS_MIN: Record<FocusMode, number> = {
  focus: 25,
  'short-break': 5,
  'long-break': 15,
};

const FOCUS_PRESETS_MIN = [15, 25, 45, 60];

const MODE_LABELS: Record<FocusMode, string> = {
  focus: 'Focus',
  'short-break': 'Short Break',
  'long-break': 'Long Break',
};

function loadSavedDurations(): Record<FocusMode, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DURATIONS_MIN };
    const parsed = JSON.parse(raw) as Partial<Record<FocusMode, number>>;
    return {
      focus: clampMinutes(parsed.focus ?? DEFAULT_DURATIONS_MIN.focus),
      'short-break': clampMinutes(parsed['short-break'] ?? DEFAULT_DURATIONS_MIN['short-break']),
      'long-break': clampMinutes(parsed['long-break'] ?? DEFAULT_DURATIONS_MIN['long-break']),
    };
  } catch {
    return { ...DEFAULT_DURATIONS_MIN };
  }
}

function clampMinutes(value: number): number {
  if (!Number.isFinite(value)) return 25;
  return Math.max(1, Math.min(180, Math.round(value)));
}

interface FocusTimerBarProps {
  task: TodoItem;
  initialMinutes?: number;
  playSound: boolean;
  onLogFocusMinutes: (task: TodoItem, minutes: number) => Promise<void> | void;
  onCompleteTask: (task: TodoItem) => void;
  onClose: () => void;
}

export function FocusTimerBar({
  task,
  initialMinutes,
  playSound,
  onLogFocusMinutes,
  onCompleteTask,
  onClose,
}: FocusTimerBarProps) {
  const [durationsMin, setDurationsMin] = useState<Record<FocusMode, number>>(() => {
    const saved = loadSavedDurations();
    if (initialMinutes && initialMinutes >= 1) {
      return { ...saved, focus: clampMinutes(initialMinutes) };
    }
    return saved;
  });
  const [mode, setMode] = useState<FocusMode>('focus');
  const [secondsLeft, setSecondsLeft] = useState<number>(() => durationsMin.focus * 60);
  const [running, setRunning] = useState<boolean>(true);
  const [minimized, setMinimized] = useState<boolean>(false);
  const [justFinished, setJustFinished] = useState<boolean>(false);
  const [customMinInput, setCustomMinInput] = useState<string>(() => String(durationsMin.focus));
  const elapsedFocusSecRef = useRef<number>(0);

  // Sync if user launches with a different initialMinutes
  useEffect(() => {
    if (initialMinutes && initialMinutes >= 1) {
      const clamped = clampMinutes(initialMinutes);
      setDurationsMin((prev) => {
        const next = { ...prev, focus: clamped };
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
      setMode('focus');
      setSecondsLeft(clamped * 60);
      setCustomMinInput(String(clamped));
      setRunning(true);
      setJustFinished(false);
    }
  }, [initialMinutes, task.id]);

  // Reset elapsed counter when switching tasks
  useEffect(() => {
    elapsedFocusSecRef.current = 0;
    setJustFinished(false);
  }, [task.id]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(id);
          setRunning(false);
          setJustFinished(true);
          if (playSound) playFocusCompleteSound();
          if (mode === 'focus') {
            const mins = Math.max(1, Math.round((elapsedFocusSecRef.current + 1) / 60));
            elapsedFocusSecRef.current = 0;
            void onLogFocusMinutes(task, mins);
          }
          return 0;
        }
        if (mode === 'focus') {
          elapsedFocusSecRef.current += 1;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, mode, playSound, task, onLogFocusMinutes]);

  const applyDurationForMode = (targetMode: FocusMode, minutes: number) => {
    const clamped = clampMinutes(minutes);
    setDurationsMin((prev) => {
      const next = { ...prev, [targetMode]: clamped };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
    if (targetMode === mode) {
      setSecondsLeft(clamped * 60);
      setCustomMinInput(String(clamped));
      setJustFinished(false);
    }
  };

  const switchMode = (nextMode: FocusMode) => {
    setMode(nextMode);
    setSecondsLeft(durationsMin[nextMode] * 60);
    setCustomMinInput(String(durationsMin[nextMode]));
    setRunning(false);
    setJustFinished(false);
  };

  const handleClose = () => {
    if (elapsedFocusSecRef.current >= 60) {
      const mins = Math.round(elapsedFocusSecRef.current / 60);
      elapsedFocusSecRef.current = 0;
      void onLogFocusMinutes(task, mins);
    }
    onClose();
  };

  const totalSec = Math.max(60, durationsMin[mode] * 60);
  const progressPct = Math.min(100, Math.max(0, ((totalSec - secondsLeft) / totalSec) * 100));
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  if (minimized) {
    return (
      <div className="focus-timer-pill" role="region" aria-label="Focus timer">
        <button
          type="button"
          className="focus-timer-pill-btn"
          onClick={() => setMinimized(false)}
          title="Expand focus timer"
        >
          <span className={`focus-dot ${running ? 'running' : ''}`} />
          <span className="focus-time-mono">{mm}:{ss}</span>
          <span className="focus-pill-title"><EmojiText text={task.text} /></span>
        </button>
        <button
          type="button"
          className="focus-icon-btn"
          onClick={() => setRunning((r) => !r)}
          aria-label={running ? 'Pause timer' : 'Resume timer'}
          title={running ? 'Pause' : 'Resume'}
        >
          {running ? '❚❚' : '▶'}
        </button>
        <button
          type="button"
          className="focus-icon-btn"
          onClick={handleClose}
          aria-label="Close focus timer"
          title="Close"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="focus-timer-bar" role="region" aria-label="Focus timer">
      <div className="focus-progress-track" aria-hidden="true">
        <div className="focus-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>
      <div className="focus-timer-header">
        <div className="focus-mode-tabs" role="tablist" aria-label="Timer mode">
          {(['focus', 'short-break', 'long-break'] as FocusMode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              className={`focus-mode-tab ${mode === m ? 'active' : ''}`}
              onClick={() => switchMode(m)}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
        <div className="focus-header-actions">
          <button
            type="button"
            className="focus-icon-btn"
            onClick={() => setMinimized(true)}
            title="Minimize timer"
            aria-label="Minimize timer"
          >
            –
          </button>
          <button
            type="button"
            className="focus-icon-btn"
            onClick={handleClose}
            title="Close timer"
            aria-label="Close timer"
          >
            ×
          </button>
        </div>
      </div>

      <div className="focus-timer-body">
        <div className="focus-task-info">
          <span className="focus-task-label">
            {justFinished ? 'Session complete!' : mode === 'focus' ? 'Focusing on' : 'Break time'}
          </span>
          <div className="focus-task-title" title={task.text}>
            <EmojiText text={task.text} />
          </div>
          {(task.focusMinutes ?? 0) > 0 && (
            <span className="focus-task-meta">
              {task.focusMinutes}m logged · {task.focusSessions ?? 1} session{(task.focusSessions ?? 1) === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {/* Adjustable duration bar */}
        <div className="focus-duration-row">
          {mode === 'focus' && (
            <div className="focus-preset-group" role="group" aria-label="Focus duration presets">
              {FOCUS_PRESETS_MIN.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`focus-preset-chip ${durationsMin.focus === preset ? 'active' : ''}`}
                  onClick={() => applyDurationForMode('focus', preset)}
                >
                  {preset}m
                </button>
              ))}
            </div>
          )}
          <div className="focus-stepper">
            <button
              type="button"
              className="focus-step-btn"
              onClick={() => applyDurationForMode(mode, durationsMin[mode] - 5)}
              title="Decrease by 5 minutes"
              aria-label="Decrease duration by 5 minutes"
            >
              −5
            </button>
            <input
              type="number"
              className="focus-custom-min-input"
              min={1}
              max={180}
              value={customMinInput}
              aria-label="Custom minutes"
              onChange={(e) => {
                setCustomMinInput(e.target.value);
                const parsed = Number(e.target.value);
                if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 180) {
                  applyDurationForMode(mode, parsed);
                }
              }}
              onBlur={() => {
                const parsed = Number(customMinInput);
                const clamped = clampMinutes(parsed || durationsMin[mode]);
                setCustomMinInput(String(clamped));
                applyDurationForMode(mode, clamped);
              }}
            />
            <span className="focus-unit-label">m</span>
            <button
              type="button"
              className="focus-step-btn"
              onClick={() => applyDurationForMode(mode, durationsMin[mode] + 5)}
              title="Increase by 5 minutes"
              aria-label="Increase duration by 5 minutes"
            >
              +5
            </button>
          </div>
        </div>

        <div className="focus-clock-group">
          <span className="focus-clock-display">{mm}:{ss}</span>
          <div className="focus-controls">
            <button
              type="button"
              className="focus-primary-btn"
              onClick={() => {
                if (secondsLeft === 0) {
                  setSecondsLeft(durationsMin[mode] * 60);
                  setJustFinished(false);
                }
                setRunning((r) => !r);
              }}
            >
              {running ? 'Pause' : secondsLeft === 0 ? 'Restart' : 'Start'}
            </button>
            <button
              type="button"
              className="focus-secondary-btn"
              onClick={() => {
                setRunning(false);
                setSecondsLeft(durationsMin[mode] * 60);
                setJustFinished(false);
                elapsedFocusSecRef.current = 0;
              }}
              title="Reset timer"
            >
              Reset
            </button>
            {!task.done && (
              <button
                type="button"
                className="focus-secondary-btn focus-done-btn"
                onClick={() => {
                  if (elapsedFocusSecRef.current >= 60) {
                    const mins = Math.round(elapsedFocusSecRef.current / 60);
                    elapsedFocusSecRef.current = 0;
                    void onLogFocusMinutes(task, mins);
                  }
                  onCompleteTask(task);
                  onClose();
                }}
                title="Complete task and close timer"
              >
                ✓ Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
