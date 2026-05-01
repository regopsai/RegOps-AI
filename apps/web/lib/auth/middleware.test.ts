import { describe, it, expect } from "vitest";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/settings",
  "/cases",
  "/customers",
  "/businesses",
  "/transactions",
  "/policies",
  "/audit-logs",
  "/select-organization",
];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

describe("middleware route matching", () => {
  it("matches all protected paths", () => {
    expect(isProtectedPath("/dashboard")).toBe(true);
    expect(isProtectedPath("/dashboard/overview")).toBe(true);
    expect(isProtectedPath("/settings/organization")).toBe(true);
    expect(isProtectedPath("/settings/members")).toBe(true);
    expect(isProtectedPath("/cases")).toBe(true);
    expect(isProtectedPath("/cases/123")).toBe(true);
    expect(isProtectedPath("/customers")).toBe(true);
    expect(isProtectedPath("/businesses")).toBe(true);
    expect(isProtectedPath("/transactions")).toBe(true);
    expect(isProtectedPath("/policies")).toBe(true);
    expect(isProtectedPath("/audit-logs")).toBe(true);
    expect(isProtectedPath("/select-organization")).toBe(true);
  });

  it("does not match public paths", () => {
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/login")).toBe(false);
    expect(isProtectedPath("/no-organization")).toBe(false);
    expect(isProtectedPath("/api/auth/callback")).toBe(false);
  });
});
