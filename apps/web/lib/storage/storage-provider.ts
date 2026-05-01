export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
}

export interface GetObjectInput {
  key: string;
}

export interface DeleteObjectInput {
  key: string;
}

export interface StorageObject {
  body: Buffer;
  contentType: string;
  size: number;
}

export interface StorageProvider {
  putObject(input: PutObjectInput): Promise<void>;
  getObject(input: GetObjectInput): Promise<StorageObject>;
  deleteObject(input: DeleteObjectInput): Promise<void>;
  getSignedDownloadUrl?(
    input: GetObjectInput,
    expiresInSeconds?: number
  ): Promise<string>;
}
