import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { availabilityVersionSchema, type AvailabilityVersion } from "../../../app/contracts/planning";
import {
  addCalendarDays,
  calendarDates,
  compareCalendarDates,
  minutesForDate,
  planningDateForInstant,
  validateAvailabilityHorizon,
  weekdayForDate,
} from "../../../app/lib/planning/calendar";

function availability(exceptions: AvailabilityVersion["exceptions"] = []): AvailabilityVersion {
  return {
    id: "availability-1",
    schemaVersion: "2026.08.1",
    timeZone: "America/New_York",
    weekdays: { monday: 60, tuesday: 30, wednesday: 0, thursday: 30, friday: 60, saturday: 0, sunday: 0 },
    exceptions,
    weeklyMinutes: 180,
    inputFingerprint: "test-fingerprint",
  };
}

describe("calendar primitives", () => {
  it("parses availability and calendar helpers without reading the current clock", () => {
    const input = availability();
    const original = Object.getOwnPropertyDescriptor(Intl, "DateTimeFormat")!;
    let noArgumentFormatCall = false;
    const RealDateTimeFormat = Intl.DateTimeFormat;

    function ClockSafeDateTimeFormat(locales?: string | string[], options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
      const formatter = new RealDateTimeFormat(locales, options);
      return {
        format(value?: number | Date) {
          if (value === undefined) {
            noArgumentFormatCall = true;
            throw new Error("Current-clock read");
          }
          return formatter.format(value);
        },
      } as Intl.DateTimeFormat;
    }

    Object.defineProperty(Intl, "DateTimeFormat", { configurable: true, value: ClockSafeDateTimeFormat });
    try {
      expect(availabilityVersionSchema.parse(input)).toEqual(input);
      expect(minutesForDate(input, "2026-08-10")).toBe(60);
      expect(() => validateAvailabilityHorizon(input, "2026-08-12")).not.toThrow();
      expect(() => availabilityVersionSchema.parse({ ...input, timeZone: "Not/AZone" })).toThrow();
      expect(noArgumentFormatCall).toBe(false);
    } finally {
      Object.defineProperty(Intl, "DateTimeFormat", original);
    }
  });

  it("adds calendar days across month, year, and leap boundaries", () => {
    expect(addCalendarDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addCalendarDays("2000-02-28", 1)).toBe("2000-02-29");
    expect(addCalendarDays("1900-02-28", 1)).toBe("1900-03-01");
    expect(addCalendarDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addCalendarDays("2026-01-01", 3660)).toBe("2036-01-09");
    expect(addCalendarDays("0001-01-01", 0)).toBe("0001-01-01");
    expect(addCalendarDays("9999-12-31", 0)).toBe("9999-12-31");
    expect(() => addCalendarDays("0001-01-01", -1)).toThrow();
    expect(() => addCalendarDays("9999-12-31", 1)).toThrow();
  });

  it("compares validated ISO calendar dates ordinally", () => {
    expect(compareCalendarDates("2026-08-12", "2026-08-12")).toBe(0);
    expect(compareCalendarDates("2026-08-11", "2026-08-12")).toBe(-1);
    expect(compareCalendarDates("2026-08-13", "2026-08-12")).toBe(1);
  });

  it("creates bounded consecutive calendar date sequences", () => {
    expect(calendarDates("2027-12-30", 4)).toEqual(["2027-12-30", "2027-12-31", "2028-01-01", "2028-01-02"]);
    expect(calendarDates("2026-08-12", 0)).toEqual([]);
    expect(() => calendarDates("2026-08-12", 3662)).toThrow();
    expect(calendarDates("0001-01-01", 1)).toEqual(["0001-01-01"]);
    expect(calendarDates("9999-12-31", 1)).toEqual(["9999-12-31"]);
    expect(() => calendarDates("0000-12-31", 2)).toThrow();
    expect(() => calendarDates("9999-12-31", 2)).toThrow();
  });

  it("calculates weekdays independently of host timezone", () => {
    expect(weekdayForDate("2026-08-10")).toBe("monday");
    expect(weekdayForDate("2026-08-16")).toBe("sunday");
  });

  it("uses an exception including a zero-minute rest day without mutation", () => {
    const value = availability([{ date: "2026-08-10", minutes: 0, reason: "Rest" }]);
    const before = structuredClone(value);
    expect(minutesForDate(value, "2026-08-10")).toBe(0);
    expect(minutesForDate(value, "2026-08-11")).toBe(30);
    expect(value).toEqual(before);
  });

  it("maps instants into their IANA calendar date across DST and UTC boundaries", () => {
    expect(planningDateForInstant("0001-01-01T00:00:00.000Z", "UTC")).toBe("0001-01-01");
    expect(planningDateForInstant("0999-12-31T00:00:00.000Z", "UTC")).toBe("0999-12-31");
    expect(planningDateForInstant("2026-03-08T06:59:59.000Z", "America/New_York")).toBe("2026-03-08");
    expect(planningDateForInstant("2026-03-08T07:00:00.000Z", "America/New_York")).toBe("2026-03-08");
    expect(planningDateForInstant("2026-11-01T05:59:59.000Z", "America/New_York")).toBe("2026-11-01");
    expect(planningDateForInstant("2026-11-01T06:00:00.000Z", "America/New_York")).toBe("2026-11-01");
    expect(planningDateForInstant("2026-08-12T16:30:00.000Z", "Asia/Shanghai")).toBe("2026-08-13");
    expect(planningDateForInstant("2026-08-12T00:30:00.000Z", "America/New_York")).toBe("2026-08-11");
    expect(planningDateForInstant("2026-03-08T04:59:59.000Z", "America/New_York")).toBe("2026-03-07");
    expect(planningDateForInstant("2026-03-08T05:00:00.000Z", "America/New_York")).toBe("2026-03-08");
    expect(planningDateForInstant("2026-03-09T03:59:59.000Z", "America/New_York")).toBe("2026-03-08");
    expect(planningDateForInstant("2026-03-09T04:00:00.000Z", "America/New_York")).toBe("2026-03-09");
    expect(planningDateForInstant("2026-11-01T03:59:59.000Z", "America/New_York")).toBe("2026-10-31");
    expect(planningDateForInstant("2026-11-01T04:00:00.000Z", "America/New_York")).toBe("2026-11-01");
    expect(planningDateForInstant("2026-11-02T04:59:59.000Z", "America/New_York")).toBe("2026-11-01");
    expect(planningDateForInstant("2026-11-02T05:00:00.000Z", "America/New_York")).toBe("2026-11-02");
    expect(planningDateForInstant("2026-08-12T16:00:00.000Z", "Asia/Shanghai")).toBe("2026-08-13");
  });

  it("validates IANA zones without reading the current clock", () => {
    const source = readFileSync("app/lib/planning/calendar.ts", "utf8");
    expect(source).not.toMatch(/\.format\(\s*\)/u);
    expect(planningDateForInstant("2026-08-12T00:30:00.000Z", "America/New_York")).toBe("2026-08-11");
    expect(() => planningDateForInstant("2026-08-12T00:30:00.000Z", "Not/AZone")).toThrow();
  });

  it("accepts named IANA zones and rejects numeric offset identifiers", () => {
    expect(planningDateForInstant("2026-08-12T00:30:00.000Z", "UTC")).toBe("2026-08-12");
    expect(planningDateForInstant("2026-08-12T00:30:00.000Z", "Etc/GMT+1")).toBe("2026-08-11");
    expect(() => planningDateForInstant("2026-08-12T00:30:00.000Z", "+01:00")).toThrow();
    expect(() => planningDateForInstant("2026-08-12T00:30:00.000Z", "-0230")).toThrow();
  });

  it("accepts exception dates from planning day through day 365 inclusively", () => {
    expect(() => validateAvailabilityHorizon(availability([{ date: "2026-08-12", minutes: 30, reason: null }]), "2026-08-12")).not.toThrow();
    expect(() => validateAvailabilityHorizon(availability([{ date: addCalendarDays("2026-08-12", 365), minutes: 30, reason: null }]), "2026-08-12")).not.toThrow();
    expect(() => validateAvailabilityHorizon(availability([{ date: addCalendarDays("2026-08-12", 366), minutes: 30, reason: null }]), "2026-08-12")).toThrow();
    expect(() => validateAvailabilityHorizon(availability([{ date: "2026-08-11", minutes: 30, reason: null }]), "2026-08-12")).toThrow();
  });

  it("rejects invalid dates, numeric inputs, instants, zones, and invalid availability", () => {
    expect(() => addCalendarDays("2026-02-29", 1)).toThrow();
    expect(() => addCalendarDays("0000-01-01", 1)).toThrow();
    expect(addCalendarDays("0001-01-01", 1)).toBe("0001-01-02");
    expect(() => addCalendarDays("2026-08-12", 0.5)).toThrow();
    expect(() => compareCalendarDates("2026-13-01", "2026-08-12")).toThrow();
    expect(() => calendarDates("2026-08-12", -1)).toThrow();
    expect(() => planningDateForInstant("not-an-instant", "UTC")).toThrow();
    expect(() => planningDateForInstant("2026-08-12T00:00:00.000Z", "Not/AZone")).toThrow();
    expect(() => planningDateForInstant("2026-08-12T00:00:00.000Z", undefined as unknown as string)).toThrow();
    expect(() => minutesForDate({ ...availability(), weeklyMinutes: 999 }, "2026-08-12")).toThrow();
  });
});
