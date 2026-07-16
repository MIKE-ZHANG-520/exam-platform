# 版本历史 · 智慧培训考试平台

本文档记录每次重大迭代，配合 git tag 使用。任意时刻可回溯到历史版本。

---

## 版本命名规则

- **v1.x.x** — 简单版本（智慧培训考试单体版）
- **v2.x.x** — 培训矩阵体系版（人 + 课 + 责任 + 时效 + 复盘 全闭环）
  - **v2.1.0** — Step 1 · 组织架构（项目/班组/花名册）
  - **v2.1.x** — v2.1 系列补丁（题库生成质量、Logo 品牌化、生成备注框等）
  - **v2.2.0** — Step 2 · 培训课程库 + 工种必修矩阵 + 人工审校
  - **v2.3.0** — Step 3 · 考试关联工人 + 培训档案 + 特种作业证
  - **v2.4.0** — Step 4 · 培训矩阵视图 + 未培训名单 + 驾驶舱升级
  - **v2.5.0** — Step 5 · 离线预生成 + 培训计划 + 智能提醒 + 方案模板
  - **v2.6.0** — Step 6 · 封面页 + 移动端整合 + 电子档案导出 + 联调
- 未来重大架构变更用 v3.x.x 起

---

## 如何回滚到旧版本

```bash
# 查看所有版本标签
git tag -l -n1

# 检出 v1.0.0（简单版本）
git checkout v1.0.0

# 或基于 v1.0.0 创建新分支
git checkout -b hotfix-v1 v1.0.0

# 返回最新
git checkout main
```

---

## v2.1.4 · 2026-07-16

**回滚 v2.1.3 越权改动：只保留底部署名**

### 背景
- v2.1.3 越权把全站 15+ 处"AI xx"文案改成了"才子佳人 xx"。
- 用户明确指令是：**只改底部署名**（Powered by AI → Powered by 才子佳人），其他 UI 文案不动。
- 承认对指令的理解出错，本版还原。

### 本次变更
- **保留 2 处**（v2.1.3 中符合用户意图的部分）：
  - `登录页页脚`：`Powered by AI` → **`Powered by 才子佳人`** ✓
  - `侧边栏底部`：`v3.0 · AI Powered` → **`v3.0 · 才子佳人 Powered`** ✓
- **还原 13 处**（v2.1.3 中越权替换的部分）：
  - 登录页副标题、三点介绍：恢复 "AI 生成"
  - 材料列表 description / 按钮：恢复 "AI"
  - 题库列表 description / 空态：恢复 "AI"
  - 材料详情页所有 10 处：恢复 "AI"（生成按钮、进度提示、备注模板、占位符、安全要点等）
  - Metadata description：恢复 "AI"
  - `lib/ai.ts` 错误信息：恢复 "AI"

### Logo 精简（v2.1.3 保留下来的正确改动）
- 悬浮 `GlobalLogo` 保留，其他位置的浅色 `BrandBadge` 不再显示（v2.1.3 已删除）。
- CZJR 橙金色的视觉更新保留。

### 影响文件
- `src/app/login/page.tsx`（副标题 + 三点）
- `src/app/layout.tsx`（description）
- `src/app/admin/banks/page.tsx`
- `src/app/admin/materials/page.tsx`
- `src/app/admin/materials/[id]/page.tsx`（10 处）
- `src/lib/ai.ts`
- `package.json` version 2.1.3 → 2.1.4

### 教训
- 用户下指令说"A 换成 B"时，先看清指令上下文（截图红框在哪个位置），不要自动扩展到全站。
- 品牌换装类改动务必先跟用户确认范围。

---

## v2.1.3 · 2026-07-16

**品牌换装：AI → 才子佳人 + Logo 精简**

### 背景
- 用户希望把面向用户展示的"AI"字样统一改为"才子佳人"品牌名。
- 之前页面里存在两处 Logo（内嵌浅色版 `BrandBadge` + 悬浮黑底版 `GlobalLogo`），用户明确"取消之前的浅色版，只保留后面这个（右下角悬浮黑底版）"。

### 本次变更
- **删除内嵌的浅色 Logo `BrandBadge`**：从 `login/page.tsx`、`admin/app-shell.tsx`、`exam/layout.tsx` 全部移除；组件文件 + 关联 CSS 类一并删除。
- **保留并优化右下角悬浮 `GlobalLogo`**：CZJR 文字改为橙金色，更贴近截图右侧按钮款视觉。
- **文案批量替换**：15+ 处面向用户展示的"AI"改为"才子佳人"：
  - 材料详情页：`AI 生成简易/中等题库` → `才子佳人生成简易/中等题库`
  - 材料详情页：`AI 生成{label}提纲` → `才子佳人生成{label}提纲`
  - 材料详情页：`等待 AI 思考` / `AI 生成中` / `AI 识别` / `AI 自由发挥` → 全部换为"才子佳人"
  - 题库/材料/登录页：描述文案统一
  - 侧边栏底部：`v3.0 · AI Powered` → `v3.0 · 才子佳人 Powered`
  - 登录页页脚：`Powered by AI` → `Powered by 才子佳人`
  - Metadata description 同步更新
  - `lib/ai.ts` 错误信息也一并更新
- **保留技术层面命名**：`lib/ai.ts` 文件名、schema 字段注释、代码注释里的"AI"保持不变（面向开发者）。

### 影响文件
- `src/components/global-logo.tsx`（CZJR 改橙金）
- `src/components/brand-badge.tsx`（**已删除**）
- `src/app/globals.css`（清理 `.brand-badge-shimmer`）
- `src/app/layout.tsx`（description）
- `src/app/login/page.tsx`（移除 BrandBadge + 文案）
- `src/app/exam/layout.tsx`（移除 BrandBadge）
- `src/components/admin/app-shell.tsx`（移除 BrandBadge + 版本文案）
- `src/app/admin/banks/page.tsx`（文案）
- `src/app/admin/materials/page.tsx`（文案）
- `src/app/admin/materials/[id]/page.tsx`（10+ 处文案）
- `src/lib/ai.ts`（错误信息）
- `package.json` version 2.1.2 → 2.1.3

---

## v2.1.2 · 2026-07-16

**题库/提纲生成加"生成要求"备注框**

### 背景
上一版把"分类识别 ≥ 40%"硬编码到题库 Prompt，会污染其他材料的题库生成。改为运营侧可配置。

### 新增
- 题库/提纲生成前可填写「生成要求」备注框，AI 生成时严格遵循
- 5 个预设模板下拉：通用 / 分类识别重点 / 操作规程强化 / 数字记忆强化 / 应急处置重点
- 备注自动持久化到 `question_banks.generation_note` / `outlines.generation_note`
- 下次打开材料页自动回填上次备注

### 撤销
- 移除硬编码的 `CLASSIFICATION_DIRECTIVE`（改为由用户备注驱动）

### 数据库
- `question_banks` 表新增 `generation_note text`
- `outlines` 表新增 `generation_note text`
- 老数据兼容：字段允许为空

### 回滚
`git checkout v2.1.1`（保留但恢复上一态）

---

## v2.1.1 · 2026-07-16

**Logo 品牌化 + 题库 Prompt 分类识别强化（后被 v2.1.2 撤销）**

### 新增
- 全局 Logo 徽章「CZJR · 制作」右下角悬浮，扫光 + 呼吸脉冲动画
- 所有页面（管理后台/考试端/登录页/未来新页）自动带 Logo
- 材料详情页移除"涉及法规/标准"卡片，重排安全要点识别布局
- 提纲生成改造为三阶段异步（避免 FaaS 网关超时）
- 题库生成 Prompt 强化分类识别要求（后在 v2.1.2 改为选填备注框驱动）

### 修复
- 数据库层清理过期法规引用（JGJ46-2005 → JGJ46-2024）
- 修复 `question_banks` 表插入时 `reviewed_by` 字段错误 → 改为 `owner_id`

---

## v2.1.0 · 2026-07-16
（原 v2.0.0-step1，命名规则升级为标准 SemVer）

**培训矩阵体系 · Step 1 花名册与组织架构**

### 新增
- 三张主表：`projects`（项目）/ `teams`（班组）/ `workers`（花名册）
- 数据库迁移已跑，含完整外键、索引、身份证唯一约束
- 7 个新 API：
  - `GET/POST/PATCH/DELETE /api/projects`
  - `GET/POST/PATCH/DELETE /api/teams`
  - `GET/POST/PATCH/DELETE /api/workers`
  - `POST /api/workers/import` — Excel 智能导入
- 3 个管理端页面：
  - `/admin/projects` — 项目管理
  - `/admin/teams` — 班组管理
  - `/admin/workers` — 花名册 + Excel 导入弹窗
- 侧边栏"组织架构"分组 + 面包屑 + 移动端汉堡菜单
- 加密工具：`encryptIdCard` / `decryptIdCard` / `maskIdCard`

### 未改动（延续 v1.0.0）
- 材料上传/AI 提纲/AI 题库/试卷/扫码考试/考试记录/数据看板 完整保留

### 已知限制
- 花名册工人尚未与 `exam_records` 关联（Step 3 完成）
- 培训完成矩阵尚不可见（Step 4 完成）

---

## v1.0.0 · 智慧培训考试（简单版本）

**智慧培训考试完整可用版**（tag: `v1.0.0`）

### 核心能力
- **材料管理**：PDF/Word/Excel/PPT/HTML 上传 + AI 解析
- **AI 提纲**：工人版（故事化）+ 培训师版（互动化）
- **AI 题库**：简单/中等两档，单选/多选/判断
- **试卷**：A/B 卷 + 二维码扫码 + 公开接口
- **工人 H5 考试**：信息录入、倒计时、切屏检测、成绩页
- **考试记录**：档案 + 答卷回顾 + 讲师五维评价
- **数据看板**：材料/试卷/考试 KPI

### 关键修复
- Bot 长响应（40-90s）通过三阶段异步接口（start/poll/finalize）避免 FaaS 网关超时
- 法规引用"零幻觉"约束，禁止 AI 自补废止版本

### 保留原因
永久保留供简单场景使用（单工地、无花名册需求）。培训矩阵体系（v2.x）向下兼容 v1.0.0 数据。
