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

## 目录结构

```
src/
├── app/
│   ├── api/                     # 后端 API 路由
│   │   ├── materials/           # 材料 CRUD + 解析/提纲/题库生成
│   │   ├── banks/               # 题库 CRUD + 题目增删
│   │   ├── questions/[id]       # 单题编辑/删除
│   │   ├── exams/               # 试卷 CRUD + 二维码 + 公开接口（开始考试）
│   │   ├── records/             # 考试记录 + 交卷 + 评价
│   │   ├── dashboard            # 数据看板聚合接口
│   │   ├── worker-profiles/     # 工人档案 + 培训 + 交底 + 审核
│   │   └── workers/[id]/public  # 公开扫码查询接口
│   ├── admin/                   # 管理后台（PC）
│   │   ├── dashboard            # 数据看板
│   │   ├── materials            # 材料管理 + 详情（提纲/题库）
│   │   ├── banks                # 题库管理 + 题目编辑
│   │   ├── exams                # 试卷管理 + 二维码弹窗
│   │   ├── records              # 考试记录 + 答卷详情
│   │   └── workers/             # 工人安全管理 + 档案详情
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
│   ├── crypto.ts                # 身份证 AES 加密/脱敏
│   ├── db.ts                    # Supabase 客户端 + 随机工具
│   ├── http.ts                  # 前端 fetch 封装
│   ├── paper.ts                 # 试卷快照构建 + 评分
│   ├── storage.ts               # 对象存储上传
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

## 开发命令

- 安装：`pnpm install`
- 开发：`pnpm dev`（端口由 DEPLOY_RUN_PORT 决定）
- 构建：`pnpm build`
- 启动：`pnpm start`
- 类型检查：`pnpm ts-check`
- Lint：`pnpm lint --quiet`
- 数据库迁移：`coze-coding-ai db upgrade`
- 模型生成：`coze-coding-ai db generate-models`

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

### v2.3.1 (2026-07-20)
- **重构**：花名册导入完全重写，AI 直接提取结构化数据
- **修复**：工人编辑表单 Select 空值崩溃
- **修复**：花名册导入「班组（工种）」复合列名识别
- **优化**：增加包含匹配兜底，提高列名识别率

### v2.3.0 (2026-07-19)
- **新增**：安全管理体系（工人入场档案、三级教育培训、入场交底、专项培训）
- **新增**：花名册批量导入（支持 Excel/CSV，自动识别表头行）
- **新增**：工人档案扫码查询（H5）
- **优化**：提纲生成降低至 3 批，加快生成速度
- **优化**：登录成功后自动预热 6 个常用接口
