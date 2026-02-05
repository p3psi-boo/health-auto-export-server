import { describe, test, expect } from "bun:test";
import { parseDate } from "./parseDate";

describe("parseDate", () => {
  test("returns null for undefined", () => {
    expect(parseDate(undefined)).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(parseDate("")).toBeNull();
    expect(parseDate("   ")).toBeNull();
  });

  test("parses unix timestamp in milliseconds", () => {
    const d = parseDate("1700000000000");
    expect(d).toBeInstanceOf(Date);
    expect(d!.getTime()).toBe(1700000000000);
  });

  test("parses YYYY-MM-DD as midnight UTC", () => {
    const d = parseDate("2026-02-05");
    expect(d).toBeInstanceOf(Date);
    expect(d!.toISOString()).toBe("2026-02-05T00:00:00.000Z");
  });

  test("parses YYYY/MM/DD as midnight UTC", () => {
    const d = parseDate("2026/02/05");
    expect(d).toBeInstanceOf(Date);
    expect(d!.toISOString()).toBe("2026-02-05T00:00:00.000Z");
  });

  test("parses YYYY-MM-DD HH:MM:SS as UTC", () => {
    const d = parseDate("2026-02-05 14:30:00");
    expect(d).toBeInstanceOf(Date);
    expect(d!.toISOString()).toBe("2026-02-05T14:30:00.000Z");
  });

  test("returns null for invalid format", () => {
    expect(parseDate("invalid")).toBeNull();
    expect(parseDate("02-05-2026")).toBeNull();
    expect(parseDate("2026-13-01")).toBeNull();
  });
});
