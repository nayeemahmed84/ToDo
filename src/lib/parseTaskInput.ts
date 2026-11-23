import { RepeatRule } from '../types/todo';

export interface ParsedTaskInput {
  /** Cleaned task title with date/time/repeat phrases removed */
  title: string;
  /** YYYY-MM-DD */
  dueDate: string | null;
  /** Epoch ms for reminder */
  reminderAtMs: number | null;
  /** Detected recurrence rule */
  repeat: RepeatRule | null;
  /** Whether any smart schedule was detected */
  hasMatch: boolean;
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const MONTHS: Record<string, number> = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getNextWeekdayDate(now: Date, targetDay: number, forceNextWeek: boolean): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let diff = (targetDay - d.getDay() + 7) % 7;
  if (forceNextWeek) {
    diff = diff === 0 ? 7 : diff + 7;
  } else if (diff === 0) {
    diff = 7;
  }
  d.setDate(d.getDate() + diff);
  return d;
}

/**
 * Parses natural-language task text such as:
 * - "Pay utilities bill by Friday 6pm"
 * - "Call mom tomorrow at 3:30pm"
 * - "Team sync every Monday at 10am"
 * - "Submit report in 2 days"
 * - "Dentist on Dec 15 at 9:00"
 */
export function parseTaskInput(rawText: string, now = new Date()): ParsedTaskInput {
  const original = rawText.trim();
  if (!original) {
    return { title: '', dueDate: null, reminderAtMs: null, repeat: null, hasMatch: false };
  }

  let working = original;
  let dueDateObj: Date | null = null;
  let timeHour: number | null = null;
  let timeMinute = 0;
  let repeat: RepeatRule | null = null;
  let hasExplicitDate = false;
  let hasExplicitTime = false;

  const stripMatch = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = working.match(re);
    if (m && m.index !== undefined) {
      fn(m);
      working = `${working.slice(0, m.index)} ${working.slice(m.index + m[0].length)}`.replace(/\s+/g, ' ').trim();
    }
  };

  // 1. Recurrence phrases: "every day", "every Monday", "every weekday", "daily", "weekly", etc.
  stripMatch(
    /\b(?:every\s+(?:other\s+)?(day|weekday|weekdays|week|month|year|sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat)|(daily|weekly|weekdays|monthly|yearly|annually))\b/i,
    (m) => {
      const token = (m[1] || m[2] || '').toLowerCase();
      if (token === 'day' || token === 'daily') repeat = 'daily';
      else if (token === 'weekday' || token === 'weekdays') repeat = 'weekdays';
      else if (token === 'week' || token === 'weekly') repeat = 'weekly';
      else if (token === 'month' || token === 'monthly') repeat = 'monthly';
      else if (token === 'year' || token === 'yearly' || token === 'annually') repeat = 'yearly';
      else if (token in WEEKDAYS) {
        repeat = 'weekly';
        dueDateObj = getNextWeekdayDate(now, WEEKDAYS[token], false);
        hasExplicitDate = true;
      }
    }
  );

  // 2. Relative "in N minutes/hours/days/weeks/months"
  stripMatch(
    /\b(?:in)\s+(\d+)\s*(minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|wks?|w|months?|mos?)\b/i,
    (m) => {
      const amount = parseInt(m[1], 10);
      const unit = m[2].toLowerCase();
      if (isNaN(amount) || amount <= 0) return;
      const dt = new Date(now.getTime());
      if (unit.startsWith('m') && !unit.startsWith('mo')) {
        dt.setMinutes(dt.getMinutes() + amount);
        dueDateObj = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
        timeHour = dt.getHours();
        timeMinute = dt.getMinutes();
        hasExplicitDate = true;
        hasExplicitTime = true;
      } else if (unit.startsWith('h')) {
        dt.setHours(dt.getHours() + amount);
        dueDateObj = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
        timeHour = dt.getHours();
        timeMinute = dt.getMinutes();
        hasExplicitDate = true;
        hasExplicitTime = true;
      } else if (unit.startsWith('d')) {
        dt.setDate(dt.getDate() + amount);
        dueDateObj = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
        hasExplicitDate = true;
      } else if (unit.startsWith('w')) {
        dt.setDate(dt.getDate() + amount * 7);
        dueDateObj = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
        hasExplicitDate = true;
      } else if (unit.startsWith('mo')) {
        dt.setMonth(dt.getMonth() + amount);
        dueDateObj = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
        hasExplicitDate = true;
      }
    }
  );

  // 3. Explicit ISO / numeric dates: YYYY-MM-DD or MM/DD(/YYYY)
  if (!hasExplicitDate) {
    stripMatch(/\b(?:(?:by|on|for|due|before|until)\s+)?(\d{4})-(\d{2})-(\d{2})\b/i, (m) => {
      const y = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10) - 1;
      const d = parseInt(m[3], 10);
      const candidate = new Date(y, mo, d);
      if (!isNaN(candidate.getTime())) {
        dueDateObj = candidate;
        hasExplicitDate = true;
      }
    });
  }

  if (!hasExplicitDate) {
    stripMatch(/\b(?:(?:by|on|for|due|before|until)\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/i, (m) => {
      const mo = parseInt(m[1], 10) - 1;
      const d = parseInt(m[2], 10);
      let y = m[3] ? parseInt(m[3], 10) : now.getFullYear();
      if (y < 100) y += 2000;
      const candidate = new Date(y, mo, d);
      if (!m[3] && candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
        candidate.setFullYear(y + 1);
      }
      if (!isNaN(candidate.getTime()) && candidate.getMonth() === mo) {
        dueDateObj = candidate;
        hasExplicitDate = true;
      }
    });
  }

  // 4. Month name + Day: "Dec 15", "on November 28, 2026", "by Jan 3rd"
  if (!hasExplicitDate) {
    stripMatch(
      /\b(?:(?:by|on|for|due|before|until)\s+)?(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\b/i,
      (m) => {
        const mo = MONTHS[m[1].toLowerCase()];
        const d = parseInt(m[2], 10);
        const y = m[3] ? parseInt(m[3], 10) : now.getFullYear();
        const candidate = new Date(y, mo, d);
        if (!m[3] && candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
          candidate.setFullYear(y + 1);
        }
        if (!isNaN(candidate.getTime()) && candidate.getMonth() === mo) {
          dueDateObj = candidate;
          hasExplicitDate = true;
        }
      }
    );
  }

  // 5. Named relative dates: today, tonight, tomorrow, next week, next month, this morning/afternoon/evening
  if (!hasExplicitDate) {
    stripMatch(
      /\b(?:(?:by|on|for|due|before|until)\s+)?(today|tod|tonight|tomorrow|tmrw|tmr|next\s+week|next\s+month|this\s+morning|this\s+afternoon|this\s+evening)\b/i,
      (m) => {
        const phrase = m[1].toLowerCase().replace(/\s+/g, ' ');
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (phrase === 'today' || phrase === 'tod') {
          dueDateObj = d;
          hasExplicitDate = true;
        } else if (phrase === 'tonight') {
          dueDateObj = d;
          hasExplicitDate = true;
          if (!hasExplicitTime) {
            timeHour = 20;
            timeMinute = 0;
            hasExplicitTime = true;
          }
        } else if (phrase === 'tomorrow' || phrase === 'tmr' || phrase === 'tmrw') {
          d.setDate(d.getDate() + 1);
          dueDateObj = d;
          hasExplicitDate = true;
        } else if (phrase === 'next week') {
          d.setDate(d.getDate() + 7);
          dueDateObj = d;
          hasExplicitDate = true;
        } else if (phrase === 'next month') {
          d.setMonth(d.getMonth() + 1);
          dueDateObj = d;
          hasExplicitDate = true;
        } else if (phrase === 'this morning') {
          dueDateObj = d;
          hasExplicitDate = true;
          timeHour = 9;
          timeMinute = 0;
          hasExplicitTime = true;
        } else if (phrase === 'this afternoon') {
          dueDateObj = d;
          hasExplicitDate = true;
          timeHour = 14;
          timeMinute = 0;
          hasExplicitTime = true;
        } else if (phrase === 'this evening') {
          dueDateObj = d;
          hasExplicitDate = true;
          timeHour = 18;
          timeMinute = 0;
          hasExplicitTime = true;
        }
      }
    );
  }

  // 6. Weekdays: "(by|on|for|due|before|this|next) Friday"
  if (!hasExplicitDate) {
    stripMatch(
      /\b(?:(?:by|on|for|due|before|until)\s+)?(?:(this|next)\s+)?(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat)\b/i,
      (m) => {
        const mod = (m[1] || '').toLowerCase();
        const wd = WEEKDAYS[m[2].toLowerCase()];
        dueDateObj = getNextWeekdayDate(now, wd, mod === 'next');
        hasExplicitDate = true;
      }
    );
  }

  // 7. Time expressions: "at 6pm", "6:30 pm", "18:00", "at noon", "at midnight"
  if (!hasExplicitTime) {
    stripMatch(/\b(?:(?:at|by|around|@)\s+)?(noon|midnight)\b/i, (m) => {
      const word = m[1].toLowerCase();
      timeHour = word === 'noon' ? 12 : 0;
      timeMinute = 0;
      hasExplicitTime = true;
    });
  }

  if (!hasExplicitTime) {
    stripMatch(
      /\b(?:(?:at|by|around|@)\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i,
      (m) => {
        let hr = parseInt(m[1], 10);
        const min = m[2] ? parseInt(m[2], 10) : 0;
        const ap = m[3].toLowerCase();
        if (hr < 1 || hr > 12 || min < 0 || min > 59) return;
        if (ap === 'pm' && hr !== 12) hr += 12;
        if (ap === 'am' && hr === 12) hr = 0;
        timeHour = hr;
        timeMinute = min;
        hasExplicitTime = true;
      }
    );
  }

  if (!hasExplicitTime) {
    stripMatch(/\b(?:at|by|around|@)\s+(\d{1,2}):(\d{2})\b/i, (m) => {
      const hr = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      if (hr < 0 || hr > 23 || min < 0 || min > 59) return;
      timeHour = hr;
      timeMinute = min;
      hasExplicitTime = true;
    });
  }

  // If time was provided without an explicit date, pick today if still in future, else tomorrow
  if (hasExplicitTime && timeHour !== null && !dueDateObj) {
    const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), timeHour, timeMinute, 0, 0);
    if (candidate.getTime() <= now.getTime()) {
      candidate.setDate(candidate.getDate() + 1);
    }
    dueDateObj = new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate());
    hasExplicitDate = true;
  }

  // Clean up dangling prepositions left at the end (e.g. "Pay bill by")
  working = working.replace(/\b(?:by|on|at|for|due|before|until)\s*$/i, '').replace(/\s+/g, ' ').trim();

  const hasMatch = hasExplicitDate || hasExplicitTime || repeat !== null;
  const dueDate = dueDateObj ? toYmd(dueDateObj) : null;
  let reminderAtMs: number | null = null;
  if (hasExplicitTime && timeHour !== null && dueDateObj) {
    const rem = new Date(dueDateObj.getFullYear(), dueDateObj.getMonth(), dueDateObj.getDate(), timeHour, timeMinute, 0, 0);
    reminderAtMs = rem.getTime();
  }

  return {
    title: working || original,
    dueDate,
    reminderAtMs,
    repeat,
    hasMatch,
  };
}
