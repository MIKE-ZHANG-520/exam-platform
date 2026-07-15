import { S3Storage } from "coze-coding-dev-sdk";

let storage: S3Storage | null = null;

export function getStorage(): S3Storage {
  if (!storage) {
    storage = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
      accessKey: "",
      secretKey: "",
      bucketName: process.env.COZE_BUCKET_NAME,
      region: "cn-beijing",
    });
  }
  return storage;
}

export async function presignUrl(key: string, expireTime = 86400): Promise<string> {
  const s = getStorage();
  return s.generatePresignedUrl({ key, expireTime });
}
