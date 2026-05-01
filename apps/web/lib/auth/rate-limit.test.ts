import { describe, it, expect, beforeEach } from "vitest";
import { isRateLimited, getRateLimitStatus, resetRateLimit } from "./rate-limit";

describe("rate limiter", () => {
  beforeEach(() => {
    resetRateLimit("test-ip");
  });

  it("allows requests under the limit", () => {
    expect(isRateLimited("test-ip")).toBe(false);
    expect(isRateLimited("test-ip")).toBe(false);
    expect(isRateLimited("test-ip")).toBe(false);
    expect(isRateLimited("test-ip")).toBe(false);
    expect(isRateLimited("test-ip")).toBe(false);
  });

  it("blocks requests over the limit", () => {
    for (let i = 0; i < 5; i++) {
      isRateLimited("test-ip");
    }
    expect(isRateLimited("test-ip")).toBe(true);
  });

  it("tracks remaining attempts correctly", () => {
    isRateLimited("test-ip");
    isRateLimited("test-ip");
    const status = getRateLimitStatus("test-ip");
    expect(status.limited).toBe(false);
    expect(status.remaining).toBe(3);
  });

  it("resets after resetRateLimit is called", () => {
    for (let i = 0; i < 5; i++) {
      isRateLimited("test-ip");
    }
    expect(isRateLimited("test-ip")).toBe(true);
    resetRateLimit("test-ip");
    expect(isRateLimited("test-ip")).toBe(false);
  });
});
