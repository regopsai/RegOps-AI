import { describe, it, expect } from "vitest";
import bcryptjs from "bcryptjs";

describe("password hashing", () => {
  it("hashes and verifies a password correctly", async () => {
    const password = "MySecurePassword123!";
    const hash = await bcryptjs.hash(password, 12);

    expect(hash).not.toBe(password);
    expect(hash.startsWith("$2")).toBe(true);

    const valid = await bcryptjs.compare(password, hash);
    expect(valid).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const password = "MySecurePassword123!";
    const hash = await bcryptjs.hash(password, 12);

    const valid = await bcryptjs.compare("WrongPassword", hash);
    expect(valid).toBe(false);
  });
});
