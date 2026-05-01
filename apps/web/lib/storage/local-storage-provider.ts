import { mkdir, writeFile, readFile, unlink, access } from "fs/promises";
import { resolve, join, normalize } from "path";
import type {
  StorageProvider,
  PutObjectInput,
  GetObjectInput,
  DeleteObjectInput,
  StorageObject,
} from "./storage-provider";

const STORAGE_ROOT = process.env.LOCAL_STORAGE_ROOT
  ? resolve(process.env.LOCAL_STORAGE_ROOT)
  : resolve(process.cwd(), ".regops-storage");

function sanitizeKey(key: string): string {
  // Prevent path traversal: reject keys that try to go outside the storage root
  const resolved = normalize(join(STORAGE_ROOT, key));
  if (!resolved.startsWith(STORAGE_ROOT)) {
    throw new Error("Invalid storage key: path traversal detected");
  }
  return resolved;
}

export class LocalStorageProvider implements StorageProvider {
  async putObject(input: PutObjectInput): Promise<void> {
    const filePath = sanitizeKey(input.key);
    await mkdir(filePath.substring(0, filePath.lastIndexOf("/")), {
      recursive: true,
    });
    await writeFile(filePath, input.body);
  }

  async getObject(input: GetObjectInput): Promise<StorageObject> {
    const filePath = sanitizeKey(input.key);
    const body = await readFile(filePath);
    return {
      body,
      contentType: "application/octet-stream",
      size: body.length,
    };
  }

  async deleteObject(input: DeleteObjectInput): Promise<void> {
    const filePath = sanitizeKey(input.key);
    try {
      await unlink(filePath);
    } catch (err) {
      const e = err as { code?: string };
      if (e.code !== "ENOENT") throw err;
    }
  }
}
