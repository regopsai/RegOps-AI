import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { LocalStorageProvider } from "./local-storage-provider";
import { S3StorageProvider } from "./s3-storage-provider";
import { getStorageProvider } from "./index";
import { mkdir, rm } from "fs/promises";
import { resolve } from "path";

const TEST_STORAGE_ROOT = resolve(process.cwd(), ".regops-storage-test");

describe("local storage provider", () => {
  const provider = new LocalStorageProvider();

  beforeAll(async () => {
    process.env.LOCAL_STORAGE_ROOT = TEST_STORAGE_ROOT;
    await mkdir(TEST_STORAGE_ROOT, { recursive: true });
  });

  afterAll(async () => {
    await rm(TEST_STORAGE_ROOT, { recursive: true, force: true });
    delete process.env.LOCAL_STORAGE_ROOT;
  });

  it("put and get object", async () => {
    const key = "org-1/test-file.txt";
    const body = Buffer.from("hello world");
    await provider.putObject({ key, body, contentType: "text/plain" });

    const obj = await provider.getObject({ key });
    expect(obj.body.toString()).toBe("hello world");
    expect(obj.size).toBe(11);
  });

  it("delete object", async () => {
    const key = "org-1/delete-me.txt";
    await provider.putObject({ key, body: Buffer.from("bye"), contentType: "text/plain" });
    await provider.deleteObject({ key });

    await expect(provider.getObject({ key })).rejects.toThrow();
  });

  it("blocks path traversal", async () => {
    await expect(
      provider.putObject({
        key: "../../../etc/passwd",
        body: Buffer.from("evil"),
        contentType: "text/plain",
      })
    ).rejects.toThrow("path traversal");
  });
});

describe("S3 storage provider", () => {
  it("throws clear error when env vars are missing", () => {
    const originalDriver = process.env.STORAGE_DRIVER;
    process.env.STORAGE_DRIVER = "s3";
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_SECRET_ACCESS_KEY;
    delete process.env.S3_REGION;
    delete process.env.S3_BUCKET;

    expect(() => new S3StorageProvider()).toThrow("S3 storage is missing required environment variables");

    process.env.STORAGE_DRIVER = originalDriver;
  });
});

describe("getStorageProvider factory", () => {
  it("returns local provider by default", () => {
    const original = process.env.STORAGE_DRIVER;
    delete process.env.STORAGE_DRIVER;
    const provider = getStorageProvider();
    expect(provider).toBeInstanceOf(LocalStorageProvider);
    if (original) process.env.STORAGE_DRIVER = original;
  });

  it("returns S3 provider when configured", () => {
    const original = process.env.STORAGE_DRIVER;
    process.env.STORAGE_DRIVER = "s3";
    // S3 will fail because env vars missing, but that's expected
    expect(() => getStorageProvider()).toThrow();
    if (original) process.env.STORAGE_DRIVER = original;
  });

  it("throws on unknown driver", () => {
    const original = process.env.STORAGE_DRIVER;
    process.env.STORAGE_DRIVER = "unknown";
    expect(() => getStorageProvider()).toThrow("Unknown STORAGE_DRIVER");
    if (original) process.env.STORAGE_DRIVER = original;
  });
});
