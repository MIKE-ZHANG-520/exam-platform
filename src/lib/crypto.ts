import crypto from "crypto";

// 简单的对称加密：用于身份证号存储。生产环境建议接入 KMS。
const RAW_KEY = process.env.COZE_PROJECT_ID || "coze-training-default-key";
const KEY = crypto.createHash("sha256").update(RAW_KEY).digest();

export function encryptSensitive(plain: string): string {
  if (!plain) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSensitive(cipherText: string): string {
  if (!cipherText) return "";
  try {
    const data = Buffer.from(cipherText, "base64");
    const iv = data.subarray(0, 12);
    const tag = data.subarray(12, 28);
    const encrypted = data.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return "";
  }
}

// 身份证号脱敏：前 4 后 4，中间用 * 替代
export function maskIdCard(idCard: string): string {
  if (!idCard) return "";
  const s = idCard.trim();
  if (s.length <= 8) return s.replace(/./g, "*");
  return `${s.slice(0, 4)}${"*".repeat(s.length - 8)}${s.slice(-4)}`;
}

// 手机号脱敏
export function maskPhone(phone: string): string {
  if (!phone) return "";
  const s = phone.trim();
  if (s.length < 7) return s;
  return `${s.slice(0, 3)}****${s.slice(-4)}`;
}
