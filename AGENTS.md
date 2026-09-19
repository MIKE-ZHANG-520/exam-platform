# AGENTS.md — 智慧培训考试平台

## 项目概览

企业级培训 + 考试一体化 Web 应用。管理后台（PC）+ 工人考试端（H5）。

核心流程：材料上传 → AI 解析/生成提纲+题库 → 创建试卷 → 二维码 → 扫码考试 → 成绩记录 → 数据看板。

## 技术栈

- Next.js 16 (App Router, `src/` 目录)
- React 19 + TypeScript 5
- shadcn/ui (Radix) + Tailwind CSS 4
- Supabase（Postgres + 对象存储 + LLM + FetchClient）
- `qrcode` 生成二维码、`recharts` 图表
- `pdf2json` 解析 PDF
- `xlsx` (SheetJS) 解析 XLSX
- `mammoth` 解析 DOCX

## 目录结构

```
src/
├── app/
│   ├── api/                     # 后端 API 路由
│   │   ├── materials/           # 材料 CRUD + 解析/提纲/题库生成（含任务队列模式）
│   │   ├── banks/               # 题库 CRUD + 题目增删
│   │   ├── questions/[id]       # 单题编辑/删除
│   │   ├── exams/               # 试卷 CRUD + 二维码 + 公开接口（开始考试）
│   │   ├── records/             # 考试记录 + 交卷 + 评价
│   │   ├── dashboard            # 数据看板聚合接口
│   │   ├── worker-profiles/     # 工人档案 + 培训 + 交底 + 审核
│   │   ├── workers/[id]/public  # 公开扫码查询接口
│   │   ├── person-materials/    # 人员入场资料分类上传/查询/删除
│   │   ├── operation-logs/      # 操作日志查询
│   │   ├── worker/queue/        # 统一后台任务队列（Worker 拉取）
│   │   ├── worker/tasks/[id]/result/ # 统一任务结果回写
│   │   └── tasks/[id]/          # 任务状态查询
│   ├── admin/                   # 管理后台（PC）
│   │   ├── dashboard            # 数据看板
│   │   ├── materials            # 材料管理 + 详情（提纲/题库）+ 新窗口预览
│   │   ├── banks                # 题库管理 + 题目编辑
│   │   ├── exams                # 试卷管理 + 二维码弹窗
│   │   ├── records              # 考试记录 + 答卷详情（按班组分类）
│   │   ├── operation-logs       # 操作日志查看
│   │   └── workers/             # 工人安全管理 + 档案详情（含入场资料分类上传）
│   └── exam/[id]/               # 工人考试端（H5）
│       ├── page.tsx             # 信息录入 + 开始考试
│       ├── paper/               # 答题页（倒计时/切屏检测/题卡）
│       ├── result/              # 成绩页
│       └── evaluate/            # 讲师评价页（5 维度星级）
├── worker/[id]/                 # 工人档案扫码查询页（H5）
├── components/
│   ├── ui/                      # shadcn 组件
│   └── admin/                   # 管理后台专用组件（sidebar/page-header）
├── lib/
│   ├── ai.ts                    # LLM/FetchClient 封装 + JSON 抽取
│   ├── auth.ts                  # 认证/鉴权（session/scrypt/requireAdmin/requireTrainerOrAbove）
│   ├── crypto.ts                # 身份证 AES 加密/脱敏
│   ├── db.ts                    # Supabase 客户端 + 随机工具
│   ├── http.ts                  # 前端 fetch 封装（apiGet/apiPost/apiPatch/apiDelete）
│   ├── operation-log.ts         # 操作日志记录工具
│   ├── paper.ts                 # 试卷快照构建 + 评分
│   ├── pdf-parser.ts            # 浏览器端 PDF 文本提取（pdfjs-dist）
│   ├── storage.ts               # 对象存储上传 + 预签名 URL
│   ├── task-queue.ts            # 统一后台任务队列（createTask/updateTaskStatus）
│   └── types.ts                 # 共享类型
└── storage/database/
    ├── shared/schema.ts         # Drizzle 表定义
    └── supabase-client.ts       # Supabase 客户端（service_role）
```

## 数据表

- `materials`：上传材料（file_name/file_type/file_url/file_size/status）
- `outlines`：提纲（audience=worker/trainer，content_md）
- `question_banks`：题库（difficulty=easy/medium，total_count）
- `questions`：题目（type=single/multiple/judge，options JSON，answer JSON）
- `exams`：试卷（paper_type=A/B，config JSON，required_fields JSON）
- `exam_records`：考试记录（paper_snapshot JSON，answers JSON，score，is_pass，attempt_no，switch_count）
- `exam_evaluations`：讲师评价（5 维度星级 + comment）
- `worker_profiles`：工人入场档案（身份证/特种作业证/体检报告/审核状态/二维码）
- `safety_trainings`：三级安全教育培训（company/project/team 三级）
- `safety_briefings`：入场交底记录
- `special_trainings`：专项培训记录
- `person_materials`：人员入场资料分类上传（category=general/safety_education/safety_briefing/other）
- `background_tasks`：统一后台任务队列（type/status/resource_type/resource_id/payload）
- `operation_logs`：操作日志（action/target/user_id/details/ip）

## 关键 API

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/materials` | GET/POST | 材料列表/上传 |
| `/api/materials/[id]` | GET/DELETE | 材料详情（含提纲+题库）/删除 |
| `/api/materials/[id]/parse` | POST | 触发文件解析（FetchClient） |
| `/api/materials/[id]/outline` | POST | AI 生成提纲（worker/trainer 两份） |
| `/api/materials/[id]/questions` | POST | AI 生成题库（easy/medium） |
| `/api/banks` | GET/POST | 题库列表/手动创建 |
| `/api/banks/[id]` | GET/DELETE | 题库详情（含题目）/删除 |
| `/api/banks/[id]/questions` | GET/POST | 题目列表/新增 |
| `/api/questions/[id]` | PATCH/DELETE | 题目编辑/删除 |
| `/api/exams` | GET/POST | 试卷列表/创建 |
| `/api/exams/[id]` | GET/PATCH/DELETE | 试卷详情/编辑/删除 |
| `/api/exams/[id]/qrcode` | GET | 二维码 DataURL |
| `/api/exams/[id]/public` | GET/POST | 公开：获取试卷/开始考试 |
| `/api/records` | GET | 考试记录列表（带筛选） |
| `/api/records/[id]` | GET/PATCH | 记录详情/切屏计数上报 |
| `/api/records/[id]/submit` | POST | 交卷评分 |
| `/api/records/[id]/evaluate` | POST | 讲师评价 |
| `/api/dashboard` | GET | 看板聚合数据 |
| `/api/worker-profiles` | GET/POST | 工人档案查询/创建更新（含文件上传） |
| `/api/worker-profiles/[workerId]/trainings` | GET/POST | 三级教育培训记录 |
| `/api/worker-profiles/[workerId]/briefings` | GET/POST | 入场交底记录 |
| `/api/worker-profiles/[workerId]/review` | POST/PUT | 档案审核/二维码生成 |
| `/api/workers/[workerId]/public` | GET | 公开接口：扫码查询工人档案 |
| `/api/person-materials` | GET/POST | 人员入场资料查询/分类上传 |
| `/api/person-materials/[id]` | DELETE | 删除人员资料 |
| `/api/operation-logs` | GET | 操作日志查询（分页+筛选） |
| `/api/worker/queue` | GET | 统一任务队列（Worker 拉取待处理任务） |
| `/api/worker/tasks/[id]/result` | POST | 统一任务结果回写 |
| `/api/tasks/[id]` | GET | 任务状态查询（前端轮询） |
| `/api/materials/[id]/generate-outline` | POST | 提纲生成任务提交 |
| `/api/materials/[id]/generate-questions` | POST | 题库生成任务提交 |

## 开发命令

- 安装：`pnpm install`
- 开发：`pnpm dev`（端口由 DEPLOY_RUN_PORT 决定）
- 构建：`pnpm build`
- 启动：`pnpm start`
- 类型检查：`pnpm ts-check`
- Lint：`pnpm lint --quiet`
- 数据库迁移：`coze-coding-ai db upgrade`
- 模型生成：`coze-coding-ai db generate-models`
- 全量备份：`pnpm backup`（或 `pnpm exec tsx scripts/backup.ts --note "备注"`）
- 恢复备份：`pnpm restore --list` / `pnpm restore --latest --dry-run` / `pnpm restore <文件名> --apply --yes`

## 数据备份与版本管理（强制规范）

### 版本号管理

- 版本号在 `package.json` 的 `version` 字段，格式 `主.次.修订`（semver）
- **每次功能更新递增次版本号（minor），bug 修复递增修订号（patch）**
- **每次更新必须同步在本文档"版本历史"章节记录**（版本号 + 日期 + 变更内容），此即项目的"版本号记忆"
- 备份文件名自带版本号（`backup-v{版本}-{时间戳}.json.gz`），数据快照与代码版本对应可溯

### 数据备份

- 备份范围：全部 18 张业务表（users/projects/teams/materials/outlines/question_banks/questions/exams/exam_records/evaluations/workers/worker_profiles/safety_trainings/safety_briefings/special_trainings/person_materials/operation_logs/background_tasks），不含 health_check（系统心跳表）
- 备份产物：单文件 gzip(JSON) 含 manifest（版本/时间/行数/每表 ID 集合 md5）+ 全部数据
- 双副本：对象存储 `backups/` 前缀（主备份，上传后回读校验 md5）+ 本地 `backups/` 目录（已 gitignore，禁止入 git）
- **必须备份的时机**：数据结构变更（加列/加表）、数据迁移、批量增删改、每次发版前
- 备份脚本：`scripts/backup.ts`（入口）+ `scripts/backup-lib.ts`（共享库，表依赖序在此维护）

### 数据恢复

- 脚本：`scripts/restore.ts`，默认 dry-run（只比对不写入），`--apply --yes` 才真正恢复
- 恢复流程：自动生成 pre-restore 兜底备份 → 按依赖逆序清空 → 按依赖序插入 → 逐表行数 + ID md5 校验
- 表依赖序（父表在前）：users → projects → teams → materials → outlines → question_banks → questions → exams → exam_records → evaluations → workers → worker_profiles → safety_trainings → safety_briefings → special_trainings → person_materials → operation_logs → background_tasks

## 编码规范

- 函数参数必须显式类型，禁止 `any` / `as any`
- 所有标点半角
- 动态数据（window/Date.now/Math.random）必须 `'use client'` + `useEffect + useState`
- 后端 API 统一 `runtime = "nodejs"`
- Supabase 使用 service_role 客户端（`src/storage/database/supabase-client.ts`），无需 RLS
- 身份证号加密存储（AES），展示用脱敏 mask
- 试卷快照（paper_snapshot）记录随机后的题目+答案，评分基于快照

## 设计规范

详见 `DESIGN.md`。要点：
- 主色 `#1E5AA8`（工业蓝），强调 `#F26E22`（提示橘）
- 通过绿 `#12A150` / 警告黄 `#D97706` / 危险红 `#DC2626`
- 字体 `PingFang SC` / `Microsoft YaHei` 系统栈
- 管理后台 PC 优先，工人端 H5 单列 480px 居中
- 动效克制：统一 `duration-150 ease-out`，禁止弹跳/视差

## 版本历史

### v2.6.0 (2026-09-20)
- **优化**：管理后台移动端全面适配（手机可完美展示与操作）
- **PageHeader**：手机上操作区自动换行到标题下方，全站 16 个页面生效
- **列表页双视图**：考试记录/工人安全管理页手机卡片视图（桌面表格不变）
- **grid 行式列表**：培训材料/考试试卷/题库管理手机 2 列卡片布局（字段小标签 + 操作区独立行）
- **表格列收纳**：花名册/用户管理/考试记录分组视图次要列手机隐藏，姓名列内嵌补充信息
- **工人档案页**：状态卡手机 2 列、Tabs 缩小、头部可换行
- **其他**：dashboard 图例换行、根 layout 显式 viewport 声明、DESIGN.md 沉淀移动端适配规范

### v2.5.0 (2026-09-19)
- **新增**：全量数据备份/恢复体系（`scripts/backup.ts` + `scripts/restore.ts` + `scripts/backup-lib.ts`），18 张业务表单文件 gzip 备份，对象存储双副本 + md5 回读校验 + ID 集合校验和，恢复支持 dry-run 预览与 pre-restore 自动兜底
- **新增**：版本号管理规范（package.json version 与备份版本联动，每次更新必须记录版本历史）
- **数据**：线上库（旧环境）全部业务数据迁移至开发库（新服务器使用）：10 张表 3296 行，迁移后逐表 ID md5 与源库完全一致
- **修复**：exam_records 表补齐缺失的 updated_at 列（自动过期功能依赖）

### v2.4.0 (2026-08-01)
- **新增**：人员入场资料分类上传（person_materials 表 + API + 前端 4 分类卡片）
- **新增**：统一后台任务队列架构（background_tasks 表 + Worker 模式）
- **新增**：操作日志功能（operation_logs 表 + 记录关键操作 + 管理页面）
- **新增**：培训主管角色（trainer）及权限体系
- **修复**：上传失败错误提示不清晰（apiPost 展示后端实际错误）
- **修复**：考试记录页面分组切换 bug
- **优化**：考试记录"按人员分组"改为"按班组分类"
- **优化**：培训材料预览改为新窗口打开
- **优化**：外部解析 API 认证（X-Parse-Token）

### v2.3.3 (2026-08-02)
- **新增**：导入接口版本指纹——所有错误信息带 `[v2.3.3]` 前缀、成功响应带 version 字段，用于验证部署是否生效
- **重构**：花名册导入采用纯表头匹配方案（列名别名 + 前 10 行表头查找 + 模糊匹配，无 AI 依赖）
- **修复**：合并单元格导致表头识别失败（自动填充合并区域值）
- **新增**：导入关键节点日志（请求到达/表头识别结果/导入结果），便于生产环境排查

### v2.3.0 (2026-07-19)
- **新增**：安全管理体系（工人入场档案、三级教育培训、入场交底、专项培训）
- **新增**：花名册批量导入（支持 Excel/CSV，自动识别表头行）
- **新增**：工人档案扫码查询（H5）
- **优化**：提纲生成降低至 3 批，加快生成速度
- **优化**：登录成功后自动预热 6 个常用接口

### v2.3.2 (2026-07-20)
- **修复**：处理 Excel 合并单元格导致的表头识别失败
- **优化**：XLSX 读取时自动填充合并单元格的值

### v2.3.3 (2026-07-20)
- **修复**：文件上传后存储 key 不匹配（uploadFile 返回带哈希后缀的 key，需使用返回值）
- **修复**：PDF 解析使用 pdf2json
- **修复**：XLSX 解析恢复（使用 SheetJS/xlsx 库）
- **修复**：DOCX 解析恢复（使用 mammoth 库）
- **修复**：auth.ts 与 proxy.ts 密钥前缀不一致导致会话验证失败
- **优化**：文件上传增加重试逻辑（最多 3 次，指数退避）+ 阻塞式存储验证
