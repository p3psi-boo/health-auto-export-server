import { describe, test, expect } from "bun:test";
import { filterFields } from "./filterFields";

describe("filterFields", () => {
  const obj = { a: 1, b: 2, c: 3, d: 4 };

  test("returns full object when no include/exclude", () => {
    expect(filterFields(obj)).toEqual(obj);
  });

  test("returns only included fields", () => {
    expect(filterFields(obj, "a,c")).toEqual({ a: 1, c: 3 });
  });

  test("handles whitespace in include", () => {
    expect(filterFields(obj, " a , c ")).toEqual({ a: 1, c: 3 });
  });

  test("excludes specified fields", () => {
    expect(filterFields(obj, undefined, "b,d")).toEqual({ a: 1, c: 3 });
  });

  test("include takes precedence over exclude", () => {
    expect(filterFields(obj, "a", "a,b")).toEqual({ a: 1 });
  });

  test("ignores non-existent include fields", () => {
    expect(filterFields(obj, "a,z")).toEqual({ a: 1 });
  });

  test("ignores non-existent exclude fields", () => {
    expect(filterFields(obj, undefined, "z")).toEqual(obj);
  });
});
