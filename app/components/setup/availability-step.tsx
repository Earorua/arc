"use client";

import { SetupDisclosure } from "./setup-disclosure";
import { calendarDateSchema, isIanaTimeZoneIdentifier } from "../../contracts/intelligence";
import type { AvailabilityException, WeekdayMinutes } from "../../contracts/planning";
import { addCalendarDays, compareCalendarDates, weekdayForDate } from "../../lib/planning/calendar";

const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const dayLabels = { monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday", friday: "Friday", saturday: "Saturday", sunday: "Sunday" };
export type AvailabilityDraft = { timeZone: string; weekdays: Record<keyof WeekdayMinutes, number | string>; exceptions: AvailabilityException[] };

export function createAvailabilityDraft(timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone): AvailabilityDraft {
  return { timeZone, weekdays: { monday: 60, tuesday: 60, wednesday: 60, thursday: 60, friday: 60, saturday: 60, sunday: 60 }, exceptions: [] };
}

function validMinutes(value: number | string, maximum = 720) { const number = Number(value); return Number.isInteger(number) && (number === 0 || (number >= 15 && number <= maximum)); }
export function weeklyMinutesForDraft(draft: AvailabilityDraft): number {
  return Object.values(draft.weekdays).reduce<number>((sum, minutes) => sum + (Number(minutes) || 0), 0);
}
export function isAvailabilityDraftValid(value: AvailabilityDraft, planningDate: string): boolean {
  try {
    if (!isIanaTimeZoneIdentifier(value.timeZone) || !calendarDateSchema.safeParse(planningDate).success) return false;
    new Intl.DateTimeFormat("en-US", { timeZone: value.timeZone });
    const total = weeklyMinutesForDraft(value);
    if (!Object.values(value.weekdays).every((minutes) => validMinutes(minutes)) || total < 30 || total > 2400) return false;
    const dates = value.exceptions.map(({ date }) => date);
    if (value.exceptions.length > 90 || new Set(dates).size !== dates.length) return false;
    const horizonEnd = addCalendarDays(planningDate, 365);
    return value.exceptions.every(({ date, minutes }) => calendarDateSchema.safeParse(date).success && validMinutes(minutes) && compareCalendarDates(date, planningDate) >= 0 && compareCalendarDates(date, horizonEnd) <= 0);
  } catch { return false; }
}

export function AvailabilityStep({ value, onChange, planningDate }: { value: AvailabilityDraft; onChange: (next: AvailabilityDraft) => void; planningDate: string }) {
  const total = weeklyMinutesForDraft(value);
  let timeZoneValid = isIanaTimeZoneIdentifier(value.timeZone);
  try { if (timeZoneValid) new Intl.DateTimeFormat("en-US", { timeZone: value.timeZone }); } catch { timeZoneValid = false; }
  const duplicateDates = value.exceptions.length !== new Set(value.exceptions.map(({ date }) => date)).size;
  const planningDateValid = calendarDateSchema.safeParse(planningDate).success;
  const dateError = (date: string) => {
    if (!calendarDateSchema.safeParse(date).success || !planningDateValid) return "Enter a valid date.";
    if (duplicateDates && value.exceptions.filter((item) => item.date === date).length > 1) return "Date overrides must use different dates.";
    try { return compareCalendarDates(date, planningDate) < 0 || compareCalendarDates(date, addCalendarDays(planningDate, 365)) > 0 ? "Choose a date within the next 365 days." : null; }
    catch { return "Enter a valid date."; }
  };
  const updateException = (index: number, patch: Partial<AvailabilityException>) => onChange({ ...value, exceptions: value.exceptions.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
  const allocate = (minutes: number) => {
    const weekdays = Object.fromEntries(days.map((day) => [day, 0])) as AvailabilityDraft["weekdays"];
    if (!Number.isInteger(minutes) || minutes < 30 || minutes > 2400) weekdays.monday = minutes;
    else {
      const studyDays = Math.min(7, Math.floor(minutes / 15));
      const base = Math.floor(minutes / studyDays);
      days.slice(0, studyDays).forEach((day, index) => { weekdays[day] = base + (index < minutes % studyDays ? 1 : 0); });
    }
    onChange({ ...value, weekdays });
  };
  return <div className="availability-ledger">
    <div className="availability-simple">
      <label className="ledger-field">How much time can you spend each week?<input aria-label="Available minutes per week" type="number" min="30" max="2400" step="1" value={total} onChange={(event) => allocate(Number(event.target.value))} /></label>
      <p>Enter minutes. The total is spread across study days; expand the daily settings to adjust each day.</p>
      <div className="availability-presets" aria-label="Weekly time presets">{[180, 420, 600].map((minutes) => <button type="button" key={minutes} aria-pressed={total === minutes} onClick={() => allocate(minutes)}>{minutes / 60} hours per week</button>)}</div>
    </div>
    <p className="weekly-total">{total} minutes / week</p>
    {(total < 30 || total > 2400 || !Number.isInteger(total)) && <p role="alert">Weekly time must be a whole number from 30 to 2400 minutes.</p>}
    <SetupDisclosure className="availability-advanced" title="Daily schedule and time zone" defaultOpen={!timeZoneValid || !Object.values(value.weekdays).every((minutes) => validMinutes(minutes))}>
    <label className="ledger-field">Time zone<input aria-describedby={!timeZoneValid ? "timezone-error" : undefined} aria-invalid={!timeZoneValid} aria-label="Time zone" onChange={(event) => onChange({ ...value, timeZone: event.target.value })} value={value.timeZone} /></label>
    {!timeZoneValid && <p id="timezone-error" role="alert">Enter a supported IANA time zone.</p>}
    {days.map((day) => { const valid = validMinutes(value.weekdays[day]); return <div className="availability-day" key={day}>
      <label>{dayLabels[day]} minutes<input aria-describedby={!valid ? `${day}-minutes-error` : undefined} aria-invalid={!valid} aria-label={`${dayLabels[day]} minutes`} min="0" max="720" step="1" type="number" value={value.weekdays[day]} onChange={(event) => onChange({ ...value, weekdays: { ...value.weekdays, [day]: event.target.value === "" ? "" : Number(event.target.value) } })} /></label>
      <span>{Number(value.weekdays[day]) === 0 ? `${dayLabels[day]} · Rest` : `${value.weekdays[day]} minutes`}</span>
      {!valid && <p id={`${day}-minutes-error`} role="alert">Enter 0 for a rest day, or a whole number from 15 to 720 for study time.</p>}
    </div>; })}
    </SetupDisclosure>
    <SetupDisclosure className="exception-ledger" title="Date overrides (optional)" defaultOpen={value.exceptions.length > 0}>
      <p>Adjust time for specific dates while keeping your regular schedule.</p>
      {value.exceptions.map((item, index) => { const itemDateError = dateError(item.date); return <div className="exception-row" key={index}>
        <label>Date<input aria-describedby={itemDateError ? `exception-date-error-${index}` : undefined} aria-invalid={Boolean(itemDateError)} aria-label={`Override date ${index + 1}`} type="date" value={item.date} onChange={(event) => updateException(index, { date: event.target.value })} /></label>
        <label>Minutes<input aria-describedby={!validMinutes(item.minutes) ? `exception-minutes-error-${index}` : undefined} aria-invalid={!validMinutes(item.minutes)} aria-label={`Override minutes ${index + 1}`} min="0" max="720" step="1" type="number" value={item.minutes} onChange={(event) => updateException(index, { minutes: Number(event.target.value) })} /></label>
        <label>Reason<input aria-label={`Override reason ${index + 1}`} maxLength={300} value={item.reason ?? ""} onChange={(event) => updateException(index, { reason: event.target.value.trim() ? event.target.value : null })} /></label>
        <p>{!itemDateError ? `${item.date} (${dayLabels[weekdayForDate(item.date)]}): ${item.minutes === 0 ? "Rest" : `${item.minutes} minutes`}.` : "Choose a date to preview the change."}</p>
        <button aria-label={`Remove date override ${index + 1}`} onClick={() => onChange({ ...value, exceptions: value.exceptions.filter((_, itemIndex) => itemIndex !== index) })} type="button">Remove</button>
        {itemDateError && <p id={`exception-date-error-${index}`} role="alert">{itemDateError}</p>}
        {!validMinutes(item.minutes) && <p id={`exception-minutes-error-${index}`} role="alert">Enter 0 or a whole number from 15 to 720.</p>}
      </div>; })}
      {value.exceptions.length >= 90 && <p>You can add up to 90 date overrides.</p>}
      <button disabled={value.exceptions.length >= 90} onClick={() => onChange({ ...value, exceptions: [...value.exceptions, { date: planningDate, minutes: 0, reason: null }] })} type="button">Add date override</button>
    </SetupDisclosure>
  </div>;
}
