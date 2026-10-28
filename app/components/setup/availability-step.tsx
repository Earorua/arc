"use client";

import { SetupDisclosure } from "./setup-disclosure";
import { calendarDateSchema, isIanaTimeZoneIdentifier } from "../../contracts/intelligence";
import type { AvailabilityException, WeekdayMinutes } from "../../contracts/planning";
import { addCalendarDays, compareCalendarDates, weekdayForDate } from "../../lib/planning/calendar";

const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const dayLabels = { monday: "周一", tuesday: "周二", wednesday: "周三", thursday: "周四", friday: "周五", saturday: "周六", sunday: "周日" };
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
    if (!calendarDateSchema.safeParse(date).success || !planningDateValid) return "请输入有效日期。";
    if (duplicateDates && value.exceptions.filter((item) => item.date === date).length > 1) return "临时安排的日期不能重复。";
    try { return compareCalendarDates(date, planningDate) < 0 || compareCalendarDates(date, addCalendarDays(planningDate, 365)) > 0 ? "请选择未来 365 天内的日期。" : null; }
    catch { return "请输入有效日期。"; }
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
      <label className="ledger-field">每周可投入多少时间？<input aria-label="每周可用分钟" type="number" min="30" max="2400" step="1" value={total} onChange={(event) => allocate(Number(event.target.value))} /></label>
      <p>单位：分钟。修改总量会均匀分配到学习日，你也可以展开后逐天调整。</p>
      <div className="availability-presets" aria-label="常用每周时间">{[180, 420, 600].map((minutes) => <button type="button" key={minutes} aria-pressed={total === minutes} onClick={() => allocate(minutes)}>每周 {minutes / 60} 小时</button>)}</div>
    </div>
    <p className="weekly-total">{total} 分钟 / 周</p>
    {(total < 30 || total > 2400 || !Number.isInteger(total)) && <p role="alert">每周总时间应为 30 至 2400 的整数分钟。</p>}
    <SetupDisclosure className="availability-advanced" title="按天调整与时区" defaultOpen={!timeZoneValid || !Object.values(value.weekdays).every((minutes) => validMinutes(minutes))}>
    <label className="ledger-field">时区<input aria-describedby={!timeZoneValid ? "timezone-error" : undefined} aria-invalid={!timeZoneValid} aria-label="时区" onChange={(event) => onChange({ ...value, timeZone: event.target.value })} value={value.timeZone} /></label>
    {!timeZoneValid && <p id="timezone-error" role="alert">请输入支持的 IANA 时区。</p>}
    {days.map((day) => { const valid = validMinutes(value.weekdays[day]); return <div className="availability-day" key={day}>
      <label>{dayLabels[day]}分钟数<input aria-describedby={!valid ? `${day}-minutes-error` : undefined} aria-invalid={!valid} aria-label={`${dayLabels[day]}分钟数`} min="0" max="720" step="1" type="number" value={value.weekdays[day]} onChange={(event) => onChange({ ...value, weekdays: { ...value.weekdays, [day]: event.target.value === "" ? "" : Number(event.target.value) } })} /></label>
      <span>{Number(value.weekdays[day]) === 0 ? `${dayLabels[day]} · 休息` : `${value.weekdays[day]} 分钟`}</span>
      {!valid && <p id={`${day}-minutes-error`} role="alert">休息请填 0，学习时间请填 15 至 720 的整数。</p>}
    </div>; })}
    </SetupDisclosure>
    <SetupDisclosure className="exception-ledger" title="临时安排（可选）" defaultOpen={value.exceptions.length > 0}>
      <p>只为特殊日期调整时间，日常安排保持原值。</p>
      {value.exceptions.map((item, index) => { const itemDateError = dateError(item.date); return <div className="exception-row" key={index}>
        <label>日期<input aria-describedby={itemDateError ? `exception-date-error-${index}` : undefined} aria-invalid={Boolean(itemDateError)} aria-label={`临时安排日期 ${index + 1}`} type="date" value={item.date} onChange={(event) => updateException(index, { date: event.target.value })} /></label>
        <label>分钟数<input aria-describedby={!validMinutes(item.minutes) ? `exception-minutes-error-${index}` : undefined} aria-invalid={!validMinutes(item.minutes)} aria-label={`临时安排分钟数 ${index + 1}`} min="0" max="720" step="1" type="number" value={item.minutes} onChange={(event) => updateException(index, { minutes: Number(event.target.value) })} /></label>
        <label>原因<input aria-label={`临时安排原因 ${index + 1}`} maxLength={300} value={item.reason ?? ""} onChange={(event) => updateException(index, { reason: event.target.value.trim() ? event.target.value : null })} /></label>
        <p>{!itemDateError ? `${item.date}（${dayLabels[weekdayForDate(item.date)]}）调整为${item.minutes === 0 ? "休息" : `${item.minutes} 分钟`}。` : "选择日期后可预览调整。"}</p>
        <button aria-label={`移除临时安排 ${index + 1}`} onClick={() => onChange({ ...value, exceptions: value.exceptions.filter((_, itemIndex) => itemIndex !== index) })} type="button">移除</button>
        {itemDateError && <p id={`exception-date-error-${index}`} role="alert">{itemDateError}</p>}
        {!validMinutes(item.minutes) && <p id={`exception-minutes-error-${index}`} role="alert">请输入 0 或 15 至 720 的整数。</p>}
      </div>; })}
      {value.exceptions.length >= 90 && <p>最多可添加 90 项临时安排</p>}
      <button disabled={value.exceptions.length >= 90} onClick={() => onChange({ ...value, exceptions: [...value.exceptions, { date: planningDate, minutes: 0, reason: null }] })} type="button">添加临时安排</button>
    </SetupDisclosure>
  </div>;
}
