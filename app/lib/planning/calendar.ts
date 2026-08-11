import { availabilityVersionSchema, type AvailabilityVersion, type WeekdayMinutes } from "../../contracts/planning";
import { calendarDateSchema, isIanaTimeZoneIdentifier } from "../../contracts/intelligence";

const MAX_CALENDAR_DAY_DELTA = 366_000;
const MAX_CALENDAR_DATE_COUNT = 3_661;
const WEEKDAYS: (keyof WeekdayMinutes)[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const ISO_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

function invalidDate(): never {
  throw new TypeError("Invalid calendar date");
}

function parseCalendarDate(value: string): { year: number; month: number; day: number } {
  if (!calendarDateSchema.safeParse(value).success) invalidDate();
  const [year, month, day] = value.split("-").map(Number);
  return { year: year!, month: month!, day: day! };
}

function toUtcDate(value: string): Date {
  const { year, month, day } = parseCalendarDate(value);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

function formatCalendarDate(date: Date): string {
  const year = date.getUTCFullYear();
  if (!Number.isFinite(date.getTime()) || year < 0 || year > 9999) invalidDate();
  const formatted = `${String(year).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  if (!calendarDateSchema.safeParse(formatted).success) invalidDate();
  return formatted;
}

function parseAvailability(value: AvailabilityVersion): AvailabilityVersion {
  const parsed = availabilityVersionSchema.safeParse(value);
  if (!parsed.success) throw new TypeError("Invalid availability");
  return parsed.data;
}

function supportedTimeZone(timeZone: string): boolean {
  if (!isIanaTimeZoneIdentifier(timeZone)) return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function addCalendarDays(date: string, days: number): string {
  if (!Number.isSafeInteger(days) || Math.abs(days) > MAX_CALENDAR_DAY_DELTA) {
    throw new RangeError("Invalid calendar day count");
  }
  const result = toUtcDate(date);
  result.setUTCDate(result.getUTCDate() + days);
  return formatCalendarDate(result);
}

export function compareCalendarDates(left: string, right: string): number {
  parseCalendarDate(left);
  parseCalendarDate(right);
  return left === right ? 0 : left < right ? -1 : 1;
}

export function calendarDates(start: string, count: number): string[] {
  parseCalendarDate(start);
  if (!Number.isSafeInteger(count) || count < 0 || count > MAX_CALENDAR_DATE_COUNT) {
    throw new RangeError("Invalid calendar date count");
  }
  return Array.from({ length: count }, (_, index) => addCalendarDays(start, index));
}

export function weekdayForDate(date: string): keyof WeekdayMinutes {
  return WEEKDAYS[toUtcDate(date).getUTCDay()]!;
}

export function minutesForDate(availability: AvailabilityVersion, date: string): number {
  const parsedAvailability = parseAvailability(availability);
  const exception = parsedAvailability.exceptions.find((item) => item.date === date);
  return exception ? exception.minutes : parsedAvailability.weekdays[weekdayForDate(date)];
}

export function planningDateForInstant(instant: string, timeZone: string): string {
  const match = ISO_INSTANT.exec(instant);
  if (!match || !supportedTimeZone(timeZone)) throw new TypeError("Invalid instant or time zone");
  const [, year, month, day, hour, minute, second] = match;
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) throw new TypeError("Invalid instant or time zone");
  parseCalendarDate(`${year}-${month}-${day}`);
  const parsed = new Date(instant);
  if (!Number.isFinite(parsed.getTime())) throw new TypeError("Invalid instant or time zone");

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);
  const getPart = (type: "year" | "month" | "day") => parts.find((part) => part.type === type)?.value;
  const formattedYear = getPart("year");
  const formattedMonth = getPart("month");
  const formattedDay = getPart("day");
  if (!formattedYear || !/^[0-9]+$/u.test(formattedYear) || !formattedMonth || !/^\d{2}$/u.test(formattedMonth) || !formattedDay || !/^\d{2}$/u.test(formattedDay)) invalidDate();
  const numericYear = Number(formattedYear);
  if (!Number.isSafeInteger(numericYear) || numericYear < 1 || numericYear > 9999) invalidDate();
  const formatted = `${formattedYear.padStart(4, "0")}-${formattedMonth}-${formattedDay}`;
  parseCalendarDate(formatted);
  return formatted;
}

export function validateAvailabilityHorizon(availability: AvailabilityVersion, planningDate: string): void {
  const parsedAvailability = parseAvailability(availability);
  parseCalendarDate(planningDate);
  const lastAllowedDate = addCalendarDays(planningDate, 365);
  for (const exception of parsedAvailability.exceptions) {
    if (compareCalendarDates(exception.date, planningDate) < 0 || compareCalendarDates(exception.date, lastAllowedDate) > 0) {
      throw new RangeError("Availability exception is outside the planning horizon");
    }
  }
}
