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

// 身份证/手机号等固定值的稳定哈希（用于查重、唯一索引查询）
// AES-GCM 每次 IV 不同产出不同密文，无法用密文做等值匹配，必须配一个稳定 hash
export function stableHash(plain: string): string {
  if (!plain) return "";
  return crypto.createHash("sha256").update(plain.trim()).digest("hex");
}

// 简单身份证格式校验：18 位纯数字 or 17 位+X
export function isValidIdCard(idCard: string): boolean {
  if (!idCard) return false;
  const s = idCard.trim();
  return /^[0-9]{17}[0-9Xx]$/.test(s) || /^[0-9]{15}$/.test(s);
}

// 从身份证提取出生年
export function extractBirthYear(idCard: string): number | null {
  if (!idCard) return null;
  const s = idCard.trim();
  if (/^[0-9]{18}$|^[0-9]{17}X$/i.test(s)) {
    const y = parseInt(s.slice(6, 10), 10);
    return isNaN(y) ? null : y;
  }
  if (/^[0-9]{15}$/.test(s)) {
    const y = parseInt("19" + s.slice(6, 8), 10);
    return isNaN(y) ? null : y;
  }
  return null;
}

// 从身份证判断性别（倒数第二位奇=男 偶=女）
export function extractGender(idCard: string): "男" | "女" | null {
  if (!idCard) return null;
  const s = idCard.trim();
  let seq: string | null = null;
  if (/^[0-9]{18}$|^[0-9]{17}X$/i.test(s)) seq = s.slice(16, 17);
  else if (/^[0-9]{15}$/.test(s)) seq = s.slice(14, 15);
  if (!seq) return null;
  const n = parseInt(seq, 10);
  if (isNaN(n)) return null;
  return n % 2 === 1 ? "男" : "女";
}
