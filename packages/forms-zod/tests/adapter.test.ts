import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zod, zodAsync } from "../index";

describe("zod sync adapter", () => {
  it("valid value returns null", () => {
    const validator = zod(z.string().email());
    expect(validator.validate("test@example.com", {} as any)).toBeNull();
  });

  it("invalid value returns issues", () => {
    const validator = zod(z.string().email());
    const result = validator.validate("not-an-email", {} as any);
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(true);
    expect((result as any[])[0].message).toBeDefined();
  });

  it("min length validation", () => {
    const validator = zod(z.string().min(5));
    expect(validator.validate("abcde", {} as any)).toBeNull();
    expect(validator.validate("abc", {} as any)).not.toBeNull();
  });

  it("number validation", () => {
    const validator = zod(z.number().min(0).max(100));
    expect(validator.validate(50, {} as any)).toBeNull();
    expect(validator.validate(-1, {} as any)).not.toBeNull();
    expect(validator.validate(101, {} as any)).not.toBeNull();
  });

  it("has correct __type and async flag", () => {
    const validator = zod(z.string());
    expect(validator.__type).toBe("form-validator");
    expect(validator.async).toBe(false);
  });
});

describe("zodAsync adapter", () => {
  it("valid value returns null", async () => {
    const validator = zodAsync(z.string().min(3));
    const ctx = { signal: new AbortController().signal } as any;
    expect(await validator.validate("abc", ctx)).toBeNull();
  });

  it("invalid value returns issues", async () => {
    const validator = zodAsync(z.string().min(5));
    const ctx = { signal: new AbortController().signal } as any;
    const result = await validator.validate("ab", ctx);
    expect(result).not.toBeNull();
  });

  it("respects aborted signal — returns null", async () => {
    const validator = zodAsync(z.string().min(3));
    const controller = new AbortController();
    controller.abort();
    const ctx = { signal: controller.signal } as any;
    // Even invalid data returns null when aborted
    expect(await validator.validate("a", ctx)).toBeNull();
  });

  it("has correct __type and async flag", () => {
    const validator = zodAsync(z.string());
    expect(validator.__type).toBe("form-validator");
    expect(validator.async).toBe(true);
  });
});
