import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  StorageProvider,
  PutObjectInput,
  GetObjectInput,
  DeleteObjectInput,
  StorageObject,
} from "./storage-provider";

function getS3Config() {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const region = process.env.S3_REGION;
  const bucket = process.env.S3_BUCKET;
  const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === "true";

  if (!endpoint || !accessKeyId || !secretAccessKey || !region || !bucket) {
    throw new Error(
      "S3 storage is missing required environment variables: " +
        "S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION, S3_BUCKET"
    );
  }

  return {
    client: new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle,
    }),
    bucket,
  };
}

export class S3StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor() {
    const config = getS3Config();
    this.client = config.client;
    this.bucket = config.bucket;
  }

  async putObject(input: PutObjectInput): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      })
    );
  }

  async getObject(input: GetObjectInput): Promise<StorageObject> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
      })
    );

    const chunks: Buffer[] = [];
    if (response.Body) {
      for await (const chunk of response.Body as AsyncIterable<Buffer>) {
        chunks.push(chunk);
      }
    }

    const body = Buffer.concat(chunks);
    return {
      body,
      contentType: response.ContentType ?? "application/octet-stream",
      size: body.length,
    };
  }

  async deleteObject(input: DeleteObjectInput): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
      })
    );
  }

  async getSignedDownloadUrl(
    input: GetObjectInput,
    expiresInSeconds = 3600
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
    });
    return getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
    });
  }
}
