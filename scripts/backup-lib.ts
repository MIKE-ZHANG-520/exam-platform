/**
 * 备份/恢复共享库 — 智慧培训考试平台
 *
 * 被 scripts/backup.ts（备份）与 scripts/restore.ts（恢复）复用。
 * 备份格式: gzip(JSON({ manifest, data }))，单文件包含全部表数据 + 版本/校验信息。
 */
import { createHash } from 'crypto';
import { gunzipSync, gzipSync } from 'zlib';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../src/storage/database/supabase-client';
import { getStorage } from '../src/lib/storage';

/** 每批读取/写入行数（Supabase 单次上限 1000，取 500 保守值） */
export const PAGE_SIZE = 500;

/** 备份目录名（本地目录 + 对象存储 key 前缀） */
export const BACKUP_DIR = 'backups';

/**
 * 备份表清单（依赖序：被引用的父表在前）。
 * 恢复时按此顺序插入；清空时按逆序删除。
 * 注: health_check 是平台基础设施心跳表（service_role 无权限），不属于业务数据，不纳入备份。
 */
export const TABLES = [
  'users',
  'projects',
  'teams',
  'materials',
  'outlines',
  'question_banks',
  'questions',
  'exams',
  'exam_records',
  'evaluations',
  'workers',
  'worker_profiles',
  'safety_trainings',
  'safety_briefings',
  'special_trainings',
  'person_materials',
  'operation_logs',
  'background_tasks',
] as const;

export type Row = Record<string, unknown>;

export interface TableStat {
  rows: number;
  /** ID 集合 md5，与 PG 的 md5(string_agg(id, ',' ORDER BY id)) 等价，用于校验数据一致性 */
  idMd5: string | null;
}

export interface Manifest {
  version: string;
  createdAt: string;
  note: string;
  totalRows: number;
  tables: Record<string, TableStat>;
}

export interface BackupFile {
  manifest: Manifest;
  data: Record<string, Row[]>;
}

/** 计算表的 ID 集合 md5（空表或无 id 列返回 null） */
export function idMd5(rows: Row[]): string | null {
  if (rows.length === 0 || !('id' in rows[0])) return null;
  const ids = rows.map((r) => String(r.id)).sort();
  return createHash('md5').update(ids.join(',')).digest('hex');
}

/** 分页导出单表全部行 */
export async function dumpTable(client: SupabaseClient, table: string): Promise<Row[]> {
  const all: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client.from(table).select('*').range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`导出 ${table} 失败: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...(data as Row[]));
    if (data.length < PAGE_SIZE) break;
  }
  return all;
}

/** 读取 package.json 版本号（备份版本 = 代码版本，保证"每次更新有版本号记忆"） */
export function getPackageVersion(): string {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8')) as { version: string };
  return pkg.version;
}

/** 北京时间（UTC+8）文件名时间戳，如 20260821-153000 */
export function beijingTs(): string {
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  return now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}

/** 导出全部表并生成 manifest */
export async function dumpAll(client: SupabaseClient, note: string): Promise<BackupFile> {
  const data: Record<string, Row[]> = {};
  const stats: Record<string, TableStat> = {};
  let total = 0;
  for (const t of TABLES) {
    const rows = await dumpTable(client, t);
    data[t] = rows;
    stats[t] = { rows: rows.length, idMd5: idMd5(rows) };
    total += rows.length;
    console.log(`  ${t}: ${rows.length} 行`);
  }
  return {
    manifest: {
      version: getPackageVersion(),
      createdAt: new Date().toISOString(),
      note,
      totalRows: total,
      tables: stats,
    },
    data,
  };
}

/** 序列化为 gzip 单文件 */
export function toGzip(bf: BackupFile): Buffer {
  return gzipSync(Buffer.from(JSON.stringify(bf), 'utf-8'));
}

/** 从 gzip 解析备份（含格式校验） */
export function fromGzip(gz: Buffer): BackupFile {
  const bf = JSON.parse(gunzipSync(gz).toString('utf-8')) as BackupFile;
  if (!bf.manifest || !bf.data || !bf.manifest.tables) {
    throw new Error('备份文件格式不正确（缺少 manifest/data 字段）');
  }
  return bf;
}

/** 上传备份到对象存储，返回真实 key */
export async function uploadBackup(gz: Buffer, filename: string): Promise<string> {
  const storage = getStorage();
  return storage.uploadFile({
    fileContent: gz,
    fileName: `${BACKUP_DIR}/${filename}`,
    contentType: 'application/gzip',
  });
}

/** 读取对象存储上的备份文件 */
export async function readRemoteBackup(key: string): Promise<Buffer> {
  const storage = getStorage();
  return storage.readFile({ fileKey: key });
}

/** 列出对象存储全部备份 key（单页最多 1000 个，超出时打印警告） */
export async function listRemoteBackups(): Promise<string[]> {
  const storage = getStorage();
  const res = await storage.listFiles({ prefix: `${BACKUP_DIR}/` });
  if (res.isTruncated) {
    console.warn('[warn] 备份文件超过单页 1000 个上限，仅返回最新一部分，请清理旧备份');
  }
  return res.keys.sort();
}

/**
 * 按来源加载备份：
 * 1. 本地路径（绝对路径 / 相对项目根 / backups/ 目录下的文件名）
 * 2. 对象存储 key（自动补 backups/ 前缀）
 */
export async function loadBackup(source: string): Promise<{ bf: BackupFile; origin: string }> {
  const candidates = [source, join(process.cwd(), source), join(process.cwd(), BACKUP_DIR, source)];
  for (const p of candidates) {
    if (existsSync(p) && !p.endsWith('/')) {
      return { bf: fromGzip(readFileSync(p)), origin: p };
    }
  }
  const key = source.startsWith(`${BACKUP_DIR}/`) ? source : `${BACKUP_DIR}/${source}`;
  try {
    return { bf: fromGzip(await readRemoteBackup(key)), origin: key };
  } catch {
    throw new Error(`找不到备份: ${source}（本地与对象存储 ${key} 均不存在）`);
  }
}

/** 从备份 key/文件名提取时间戳，用于排序找最新备份 */
export function tsOfKey(key: string): string {
  const m = /-(\d{8}-\d{6})\.json\.gz$/.exec(key);
  return m ? m[1] : '';
}

/** 获取最新备份 key（按文件名时间戳），无备份返回 null */
export async function latestBackupKey(): Promise<string | null> {
  const keys = await listRemoteBackups();
  if (keys.length === 0) return null;
  let best = keys[0] as string;
  for (const k of keys) {
    if (tsOfKey(k) > tsOfKey(best)) best = k;
  }
  return best;
}

export { getSupabaseClient };
