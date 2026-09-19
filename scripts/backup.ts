/**
 * 全量数据备份脚本 — 智慧培训考试平台
 *
 * 用法:
 *   pnpm exec tsx scripts/backup.ts [--note "备注"]
 *
 * 产物（同一份内容的两个副本）:
 *   1. 对象存储 backups/backup-v{版本}-{时间戳}.json.gz  —— 主备份（服务器与开发环境共享同一桶，永久保存）
 *   2. 本地项目目录 backups/ 同名文件                     —— 副本（勿入 git）
 *
 * 备份内容: 全部 19 张表 + manifest（版本号 / 行数 / ID 集合 md5 校验和 / 备注）
 * 时机: 每次数据结构变更、重要数据操作（迁移/批量删除）后执行；版本号取自 package.json。
 * 恢复: pnpm exec tsx scripts/restore.ts --list 查看全部备份
 */
import { createHash } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  BACKUP_DIR,
  beijingTs,
  dumpAll,
  getPackageVersion,
  getSupabaseClient,
  readRemoteBackup,
  toGzip,
  uploadBackup,
} from './backup-lib';

async function main(): Promise<void> {
  const noteIdx = process.argv.indexOf('--note');
  const note = noteIdx > -1 ? (process.argv[noteIdx + 1] ?? '') : '';

  const version = getPackageVersion();
  const ts = beijingTs();
  console.log(`[backup] 版本 v${version}，开始全量导出（北京时间 ${ts}）...`);

  const client = getSupabaseClient();
  const bf = await dumpAll(client, note);
  const gz = toGzip(bf);
  const localMd5 = createHash('md5').update(gz).digest('hex');
  const filename = `backup-v${version}-${ts}.json.gz`;

  // 1) 上传对象存储（主备份）+ 回读校验，确保云端文件完整可读
  const key = await uploadBackup(gz, filename);
  const remoteMd5 = createHash('md5').update(await readRemoteBackup(key)).digest('hex');
  if (remoteMd5 !== localMd5) {
    throw new Error(`云端回读校验失败: md5 ${remoteMd5} != ${localMd5}`);
  }
  console.log(`[backup] 对象存储已上传并回读校验通过: ${key}`);

  // 2) 本地副本
  const localDir = join(process.cwd(), BACKUP_DIR);
  mkdirSync(localDir, { recursive: true });
  writeFileSync(join(localDir, filename), gz);
  console.log(`[backup] 本地副本: ${BACKUP_DIR}/${filename}（${(gz.length / 1024).toFixed(1)} KB）`);

  console.log(
    `[backup] 完成: 共 ${bf.manifest.totalRows} 行 / ${Object.keys(bf.manifest.tables).length} 张表，` +
      `版本 v${version}${note ? `，备注: ${note}` : ''}`,
  );
  console.log(`[backup] 恢复命令: pnpm exec tsx scripts/restore.ts ${filename} --dry-run`);
}

main().catch((e: unknown) => {
  console.error('[backup] FATAL:', e instanceof Error ? e.message : e);
  process.exit(1);
});
