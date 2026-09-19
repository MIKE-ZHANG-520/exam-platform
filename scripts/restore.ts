/**
 * 数据恢复脚本 — 智慧培训考试平台
 *
 * 用法:
 *   pnpm exec tsx scripts/restore.ts --list                  # 列出对象存储全部备份
 *   pnpm exec tsx scripts/restore.ts --latest --dry-run      # 查看最新备份与当前库差异
 *   pnpm exec tsx scripts/restore.ts <文件名|路径|key> --dry-run
 *   pnpm exec tsx scripts/restore.ts <文件名|路径|key> --apply --yes   # 真正恢复
 *
 * 恢复策略（--apply）:
 *   1. 先自动生成 pre-restore 备份并上传对象存储（安全兜底，恢复失败可回退）
 *   2. 按依赖逆序清空全部业务表 → 按依赖序全量插入备份数据
 *   3. 逐表校验行数 + ID 集合 md5，与备份 manifest 完全一致才算成功
 */
import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PAGE_SIZE,
  TABLES,
  dumpAll,
  dumpTable,
  getPackageVersion,
  getSupabaseClient,
  idMd5,
  latestBackupKey,
  listRemoteBackups,
  loadBackup,
  toGzip,
  uploadBackup,
  type BackupFile,
  type Row,
} from './backup-lib';

interface CliArgs {
  list: boolean;
  latest: boolean;
  dryRun: boolean;
  apply: boolean;
  yes: boolean;
  source: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const positional = argv.filter((a) => !a.startsWith('--'));
  return {
    list: flags.has('--list'),
    latest: flags.has('--latest'),
    dryRun: flags.has('--dry-run'),
    apply: flags.has('--apply'),
    yes: flags.has('--yes'),
    source: positional.length > 0 ? (positional[0] as string) : null,
  };
}

async function cmdList(): Promise<void> {
  const keys = await listRemoteBackups();
  if (keys.length === 0) {
    console.log('对象存储暂无备份。先执行: pnpm exec tsx scripts/backup.ts');
    return;
  }
  console.log(`对象存储共 ${keys.length} 个备份（${TABLES.length} 张表全量）:`);
  for (const k of keys) {
    console.log(`  ${k}`);
  }
  console.log('查看内容: pnpm exec tsx scripts/restore.ts <文件名> --dry-run');
}

/** 对比备份与当前数据库，打印差异 */
async function diffWithDb(client: SupabaseClient, bf: BackupFile, origin: string): Promise<void> {
  console.log(`\n备份: ${origin}`);
  console.log(`版本: v${bf.manifest.version}  创建于: ${bf.manifest.createdAt}  备注: ${bf.manifest.note || '(无)'}`);
  console.log(`\n表名              备份行数   当前库行数   状态`);
  console.log('─'.repeat(56));
  for (const t of TABLES) {
    const backupRows = bf.data[t] ?? [];
    const backupStat = bf.manifest.tables[t];
    const currentRows = await dumpTable(client, t);
    const same =
      backupStat &&
      backupStat.rows === currentRows.length &&
      backupStat.idMd5 === idMd5(currentRows);
    console.log(
      `${t.padEnd(18)} ${String(backupRows.length).padStart(6)}    ${String(currentRows.length).padStart(6)}      ${
        same ? '一致' : '差异'
      }`,
    );
  }
}

/** 清空全部业务表（依赖逆序） */
async function clearAllTables(client: SupabaseClient): Promise<void> {
  const reversed = [...TABLES].reverse();
  for (const t of reversed) {
    const { error } = await client.from(t).delete().not('id', 'is', null);
    if (error) throw new Error(`清空 ${t} 失败: ${error.message}`);
    process.stdout.write(`  已清空 ${t}\n`);
  }
}

/** 按依赖序全量插入备份数据 */
async function insertAllTables(client: SupabaseClient, bf: BackupFile): Promise<void> {
  for (const t of TABLES) {
    const rows = (bf.data[t] ?? []) as Row[];
    if (rows.length === 0) continue;
    for (let i = 0; i < rows.length; i += PAGE_SIZE) {
      const batch = rows.slice(i, i + PAGE_SIZE);
      const { error } = await client.from(t).insert(batch);
      if (error) throw new Error(`恢复 ${t} 第 ${Math.floor(i / PAGE_SIZE) + 1} 批失败: ${error.message}`);
    }
    console.log(`  已恢复 ${t}: ${rows.length} 行`);
  }
}

/** 恢复后校验：逐表行数 + ID md5 与备份 manifest 比对 */
async function verifyRestored(client: SupabaseClient, bf: BackupFile): Promise<boolean> {
  let allOk = true;
  for (const t of TABLES) {
    const expected = bf.manifest.tables[t];
    const expectedRows = expected ? expected.rows : (bf.data[t] ?? []).length;
    const currentRows = await dumpTable(client, t);
    const ok = expectedRows === currentRows.length && (expected ? expected.idMd5 : null) === idMd5(currentRows);
    if (!ok) allOk = false;
    console.log(`  ${t}: 期望 ${expectedRows} 行 / 实际 ${currentRows.length} 行 ${ok ? 'OK' : '!! 不一致'}`);
  }
  return allOk;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const client = getSupabaseClient();

  if (args.list) {
    await cmdList();
    return;
  }

  // 解析备份来源: --latest 或显式指定
  let source = args.source;
  if (args.latest) {
    const key = await latestBackupKey();
    if (!key) throw new Error('对象存储暂无备份');
    source = key;
  }
  if (!source) {
    console.log(
      '用法:\n' +
        '  pnpm exec tsx scripts/restore.ts --list\n' +
        '  pnpm exec tsx scripts/restore.ts --latest --dry-run\n' +
        '  pnpm exec tsx scripts/restore.ts <文件名|路径|key> --dry-run\n' +
        '  pnpm exec tsx scripts/restore.ts <文件名|路径|key> --apply --yes',
    );
    return;
  }

  const { bf, origin } = await loadBackup(source);

  // 默认 dry-run（安全）：仅校验并展示与当前库的差异
  if (!args.apply) {
    await diffWithDb(client, bf, origin);
    console.log('\n以上为差异预览（未写入任何数据）。确认恢复请追加: --apply --yes');
    return;
  }

  // 真正恢复（危险操作，需双重参数确认）
  if (!args.yes) {
    throw new Error('恢复会清空并重写全部业务表，请追加 --yes 确认执行');
  }

  // 1. pre-restore 自动备份（兜底）
  console.log(`[restore] 第 1/4 步: 生成 pre-restore 自动备份（版本 v${getPackageVersion()}）...`);
  const preBf = await dumpAll(client, `pre-restore before ${origin}`);
  const preKey = await uploadBackup(toGzip(preBf), `backup-v${getPackageVersion()}-pre-${Date.now()}.json.gz`);
  console.log(`[restore] pre-restore 备份已上传: ${preKey}`);

  // 2. 清空
  console.log('[restore] 第 2/4 步: 清空业务表...');
  await clearAllTables(client);

  // 3. 插入
  console.log('[restore] 第 3/4 步: 写入备份数据...');
  await insertAllTables(client, bf);

  // 4. 校验
  console.log('[restore] 第 4/4 步: 校验恢复结果...');
  const ok = await verifyRestored(client, bf);
  if (!ok) {
    throw new Error(`恢复校验未通过！当前库状态可能不完整，可用 pre-restore 备份回退: ${preKey}`);
  }
  console.log(`[restore] 完成！已恢复到备份时点: ${origin}（版本 v${bf.manifest.version}, ${bf.manifest.createdAt}）`);
}

main().catch((e: unknown) => {
  console.error('[restore] FATAL:', e instanceof Error ? e.message : e);
  process.exit(1);
});
