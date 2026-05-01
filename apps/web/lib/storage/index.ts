import { LocalStorageProvider } from "./local-storage-provider";
import { S3StorageProvider } from "./s3-storage-provider";
import type { StorageProvider } from "./storage-provider";

export type { StorageProvider } from "./storage-provider";

export function getStorageProvider(): StorageProvider {
  const driver = process.env.STORAGE_DRIVER ?? "local";

  if (driver === "s3") {
    return new S3StorageProvider();
  }

  if (driver === "local") {
    return new LocalStorageProvider();
  }

  throw new Error(
    `Unknown STORAGE_DRIVER: ${driver}. Expected "local" or "s3".`
  );
}
