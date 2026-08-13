"use client";

import { calendarDateSchema, isIanaTimeZoneIdentifier } from "../../contracts/intelligence";
import type { AvailabilityException, WeekdayMinutes } from "../../contracts/planning";
import { addCalendarDays, compareCalendarDates, weekdayForDate } from "../../lib/planning/calendar";

const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
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
    if (!calendarDateSchema.safeParse(date).success || !planningDateValid) return "Enter a valid calendar date.";
    if (duplicateDates && value.exceptions.filter((item) => item.date === date).length > 1) return "Exception dates must be unique.";
    try { return compareCalendarDates(date, planningDate) < 0 || compareCalendarDates(date, addCalendarDays(planningDate, 365)) > 0 ? "Choose a date within the next 365 days." : null; }
    catch { return "Enter a valid calendar date."; }
  };
  const updateException = (index: number, patch: Partial<AvailabilityException>) => onChange({ ...value, exceptions: value.exceptions.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
  return <div className="availability-ledger">
    <label className="ledger-field">Time zone<input aria-describedby={!timeZoneValid ? "timezone-error" : undefined} aria-invalid={!timeZoneValid} aria-label="Time zone" onChange={(event) => onChange({ ...value, timeZone: event.target.value })} value={value.timeZone} /></label>
    {!timeZoneValid && <p id="timezone-error" role="alert">Enter a supported IANA time zone.</p>}
    <p className="weekly-total">{total} minutes / week</p>
    {days.map((day) => { const valid = validMinutes(value.weekdays[day]); return <div className="availability-day" key={day}>
      <label>{day[0]!.toUpperCase() + day.slice(1)} minutes<input aria-describedby={!valid ? `${day}-minutes-error` : undefined} aria-invalid={!valid} aria-label={`${day[0]!.toUpperCase() + day.slice(1)} minutes`} min="0" max="720" step="1" type="number" value={value.weekdays[day]} onChange={(event) => onChange({ ...value, weekdays: { ...value.weekdays, [day]: event.target.value === "" ? "" : Number(event.target.value) } })} /></label>
      <span>{Number(value.weekdays[day]) === 0 ? `${day[0]!.toUpperCase() + day.slice(1)} · Rest` : `${value.weekdays[day]} min`}</span>
      {!valid && <p id={`${day}-minutes-error`} role="alert">Use 0 for Rest or a whole number from 15 to 720.</p>}
    </div>; })}
    {(total < 30 || total > 2400) && <p role="alert">Weekly total must be 30 to 2400 minutes.</p>}
    <div className="exception-ledger">
      <h2>Date exceptions</h2>
      {value.exceptions.map((item, index) => { const itemDateError = dateError(item.date); return <div className="exception-row" key={index}>
        <label>Date<input aria-describedby={itemDateError ? `exception-date-error-${index}` : undefined} aria-invalid={Boolean(itemDateError)} aria-label={`Exception date ${index + 1}`} type="date" value={item.date} onChange={(event) => updateException(index, { date: event.target.value })} /></label>
        <label>Minutes<input aria-describedby={!validMinutes(item.minutes) ? `exception-minutes-error-${index}` : undefined} aria-invalid={!validMinutes(item.minutes)} aria-label={`Exception minutes ${index + 1}`} min="0" max="720" step="1" type="number" value={item.minutes} onChange={(event) => updateException(index, { minutes: Number(event.target.value) })} /></label>
        <label>Reason<input aria-label={`Exception reason ${index + 1}`} maxLength={300} value={item.reason ?? ""} onChange={(event) => updateException(index, { reason: event.target.value.trim() ? event.target.value : null })} /></label>
        <p>{!itemDateError ? `${item.date} overrides ${weekdayForDate(item.date)[0]!.toUpperCase() + weekdayForDate(item.date).slice(1)} with ${item.minutes === 0 ? "Rest" : `${item.minutes} minutes`}.` : "Choose a date to preview the override."}</p>
        <button aria-label={`Remove exception ${index + 1}`} onClick={() => onChange({ ...value, exceptions: value.exceptions.filter((_, itemIndex) => itemIndex !== index) })} type="button">Remove</button>
        {itemDateError && <p id={`exception-date-error-${index}`} role="alert">{itemDateError}</p>}
        {!validMinutes(item.minutes) && <p id={`exception-minutes-error-${index}`} role="alert">Use 0 or a whole number from 15 to 720.</p>}
      </div>; })}
      {value.exceptions.length >= 90 && <p>Maximum 90 exceptions</p>}
      <button disabled={value.exceptions.length >= 90} onClick={() => onChange({ ...value, exceptions: [...value.exceptions, { date: planningDate, minutes: 0, reason: null }] })} type="button">Add date exception</button>
    </div>
  </div>;
}
