import { RepeatRule, TodoItem } from '../types/todo';

export type RepeatCustom = NonNullable<TodoItem['repeatCustom']>;

export interface NextRepeatDateOptions {
  baseDate: string | null | undefined;
  rule: RepeatRule | undefined;
  custom?: RepeatCustom | null;
  /** Local YYYY-MM-DD used when baseDate is missing (e.g. completion date). */
  referenceDate?: string;
}

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatLocalYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseYmd(ymd: string): { year: number; month: number; day: number } | null {
  const match = YMD_RE.exec(ymd.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const check = new Date(year, month - 1, day);
  if (
    check.getFullYear() !== year ||
    check.getMonth() !== month - 1 ||
    check.getDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function addDaysYmd(ymd: string, deltaDays: number): string {
  const parsed = parseYmd(ymd);
  if (!parsed) return ymd;
  const dt = new Date(parsed.year, parsed.month - 1, parsed.day + deltaDays);
  return formatLocalYmd(dt);
}

export function addMonthsClampedYmd(ymd: string, deltaMonths: number): string {
  const parsed = parseYmd(ymd);
  if (!parsed) return ymd;
  const totalMonths = parsed.year * 12 + (parsed.month - 1) + deltaMonths;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12 + 12) % 12 + 1;
  const clampedDay = Math.min(parsed.day, daysInMonth(targetYear, targetMonth));
  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

export function addYearsClampedYmd(ymd: string, deltaYears: number): string {
  const parsed = parseYmd(ymd);
  if (!parsed) return ymd;
  const targetYear = parsed.year + deltaYears;
  const clampedDay = Math.min(parsed.day, daysInMonth(targetYear, parsed.month));
  return `${String(targetYear).padStart(4, '0')}-${String(parsed.month).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

export function getDayOfWeekYmd(ymd: string): number {
  const parsed = parseYmd(ymd);
  if (!parsed) return 0;
  return new Date(parsed.year, parsed.month - 1, parsed.day).getDay();
}

/**
 * Calculates the next due date (local YYYY-MM-DD) for a recurring task.
 *
 * Rules:
 * - If baseDate is absent, uses referenceDate (completion date, defaulting to local today) as the base.
 * - daily: +1 calendar day.
 * - weekdays: next Monday-Friday strictly after baseDate (Fri->Mon, Sat->Mon, Sun->Mon).
 * - weekly: +7 calendar days.
 * - monthly: +1 month with month-end clamping (e.g. Jan 31 -> Feb 28/29).
 * - yearly: +1 year with leap-day clamping (e.g. Feb 29 -> Feb 28 in non-leap years).
 * - custom: uses interval (>=1), unit ('days'|'weeks'|'months'|'years'), and for 'weeks'
 *   honors selected weekday numbers (0=Sun..6=Sat) within the same week before jumping
 *   ahead by `interval` weeks to the earliest selected weekday.
 */
export function getNextRepeatDate(options: NextRepeatDateOptions): string | null {
  const { rule, custom } = options;
  if (!rule || rule === 'none') return null;

  const fallbackBase = options.referenceDate ?? formatLocalYmd(new Date());
  const base = options.baseDate && parseYmd(options.baseDate) ? options.baseDate : fallbackBase;

  switch (rule) {
    case 'daily':
      return addDaysYmd(base, 1);

    case 'weekdays': {
      const dow = getDayOfWeekYmd(base);
      if (dow === 5) return addDaysYmd(base, 3); // Friday -> Monday
      if (dow === 6) return addDaysYmd(base, 2); // Saturday -> Monday
      return addDaysYmd(base, 1); // Sun-Thu -> next day (Mon-Fri)
    }

    case 'weekly':
      return addDaysYmd(base, 7);

    case 'monthly':
      return addMonthsClampedYmd(base, 1);

    case 'yearly':
      return addYearsClampedYmd(base, 1);

    case 'custom': {
      const interval = Math.max(1, Math.floor(custom?.interval ?? 1));
      const unit = custom?.unit ?? 'days';

      if (unit === 'days') return addDaysYmd(base, interval);
      if (unit === 'months') return addMonthsClampedYmd(base, interval);
      if (unit === 'years') return addYearsClampedYmd(base, interval);

      // unit === 'weeks'
      const validDays = Array.from(
        new Set(
          (custom?.days ?? []).filter(
            (d): d is number => Number.isInteger(d) && d >= 0 && d <= 6
          )
        )
      ).sort((a, b) => a - b);

      if (validDays.length === 0) {
        return addDaysYmd(base, interval * 7);
      }

      const baseDow = getDayOfWeekYmd(base);
      const laterInSameWeek = validDays.find((d) => d > baseDow);
      if (laterInSameWeek !== undefined) {
        return addDaysYmd(base, laterInSameWeek - baseDow);
      }

      const deltaDays = interval * 7 - baseDow + validDays[0];
      return addDaysYmd(base, deltaDays);
    }

    default:
      return null;
  }
}

/**
 * Shifts an existing reminder timestamp's local time-of-day onto the next occurrence's due date.
 */
export function shiftReminderToDate(
  previousReminderAtMs: number | null | undefined,
  nextDueYmd: string
): number | null {
  if (!previousReminderAtMs || !Number.isFinite(previousReminderAtMs)) return null;
  const parsed = parseYmd(nextDueYmd);
  if (!parsed) return null;
  const prev = new Date(previousReminderAtMs);
  const next = new Date(
    parsed.year,
    parsed.month - 1,
    parsed.day,
    prev.getHours(),
    prev.getMinutes(),
    prev.getSeconds(),
    prev.getMilliseconds()
  );
  return next.getTime();
}

/**
 * Builds the Firestore payload for the next occurrence of a completed recurring task.
 *
 * Carry-forward policy:
 * - Preserved: listId, text, important, repeat, repeatCustom, category, notes, assignedTo,
 *   steps (with each step reset to done: false), and reminder time-of-day shifted to nextDue.
 * - Reset: done (false), completedAtMs (null), myDayDate (null), attachments ([]),
 *   reminderNotified (false), recurrenceSpawned (false).
 */
export function buildNextRecurringItemPayload(params: {
  item: TodoItem;
  nextDue: string;
  creatorUid: string;
  creatorName: string | null;
  nowMs?: number;
}) {
  const { item, nextDue, creatorUid, creatorName, nowMs = Date.now() } = params;
  const nextReminderAtMs = shiftReminderToDate(item.reminderAtMs, nextDue);
  const repeatCustom =
    item.repeat === 'custom' && item.repeatCustom
      ? {
          interval: Math.max(1, Math.floor(item.repeatCustom.interval || 1)),
          unit: item.repeatCustom.unit,
          days: Array.isArray(item.repeatCustom.days) ? [...item.repeatCustom.days] : [],
        }
      : null;

  return {
    listId: item.listId,
    ownerUid: creatorUid,
    createdByName: creatorName,
    text: item.text,
    done: false,
    important: Boolean(item.important),
    myDayDate: null,
    dueDate: nextDue,
    reminderAtMs: nextReminderAtMs,
    reminderNotified: false,
    reminderStatus: nextReminderAtMs ? ('pending' as const) : null,
    repeat: item.repeat ?? 'none',
    repeatCustom,
    assignedTo: item.assignedTo ?? null,
    attachments: [],
    category: item.category ?? null,
    notes: item.notes ?? '',
    steps: (item.steps ?? []).map((s) => ({ ...s, done: false })),
    createdAtMs: nowMs,
    completedAtMs: null,
    recurrenceSpawned: false,
  };
}
