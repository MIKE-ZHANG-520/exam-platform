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

## v2.3.0 · 2026-07-19

**安全管理体系 · 一人一档 + 入场审核 + 培训记录 + 二维码**

### 背景
- 用户要求构建完整的安全管理体系
- 新工人入场前需提交身份证、特种作业证、体检报告等资料
- 资料审核通过后进行三级安全教育培训和入场交底
- 完成后生成专属二维码，可打印张贴于安全帽
- 管理人员扫码可查看工人培训档案、证件有效期等信息

### 新增功能

#### 1. 数据表扩展
| 表名 | 说明 |
|------|------|
| `worker_profiles` | 工人入场档案（身份证/特种作业证/体检报告/审核状态/二维码） |
| `safety_trainings` | 三级安全教育培训记录（公司级/项目级/班组级） |
| `safety_briefings` | 入场交底记录 |
| `special_trainings` | 专项培训记录 |

#### 2. 工人安全管理页面（/admin/workers）
- 工人列表展示档案状态、入场状态
- 统计卡片：总人数、待审核、已通过、已入场、证件即将到期
- 筛选：按审核状态、入场状态筛选
- 证件到期预警（30天内）

#### 3. 工人档案详情页（/admin/workers/[workerId]/profile）
- **入场资料 Tab**：上传身份证正反面、特种作业证、体检报告
- **三级教育 Tab**：记录公司级/项目级/班组级培训
- **入场交底 Tab**：记录入场安全交底
- **二维码 Tab**：生成并打印入场二维码
- 审核功能：通过/驳回，驳回需填写原因

#### 4. 扫码查询页（/worker/[id]）
- H5 页面，管理人员扫码查看
- 展示工人基本信息、入场状态
- 特种作业证有效期状态
- 三级教育完成情况
- 培训记录和交底记录

#### 5. API 接口
| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/worker-profiles` | GET/POST | 工人档案查询/创建更新（含文件上传） |
| `/api/worker-profiles/[workerId]/trainings` | GET/POST | 三级教育培训记录 |
| `/api/worker-profiles/[workerId]/briefings` | GET/POST | 入场交底记录 |
| `/api/worker-profiles/[workerId]/review` | POST/PUT | 档案审核/二维码生成 |
| `/api/workers/[id]/public` | GET | 公开接口：扫码查询工人档案 |

### 入场流程
```
上传资料 → 待审核 → 审核通过 → 三级教育培训 → 入场交底 → 已入场 → 生成二维码
                ↓
              驳回（需补充资料）
```

### 影响文件
- 新增：`src/app/admin/workers/page.tsx`
- 新增：`src/app/admin/workers/[workerId]/profile/page.tsx`
- 新增：`src/app/worker/[id]/page.tsx`
- 新增：`src/app/api/worker-profiles/` 系列 API
- 新增：`src/app/api/workers/[id]/public/route.ts`
- 修改：`src/storage/database/shared/schema.ts`（新增数据表）
- 修改：`src/components/admin/app-shell.tsx`（导航更新）
- 修改：`src/app/api/workers/route.ts`（支持档案关联查询）
- `package.json` version 2.2.0 → 2.3.0

---

## v2.1.7 · 2026-07-16

**工人考试端 · 班组改为下拉选择 + 分包强制填写具体班组**

### 背景
- 用户要求：班组字段设 4 个固定项（EM、监理、中闽大秦总包、中闽大秦分包）
- 选择"中闽大秦分包"后，**强制**再填一个具体班组名称（如"电气一班"）
- 其他三项直接选完即可，无需额外输入

### 本次变更
**`src/app/exam/[id]/page.tsx` · 工人考试信息录入页**

| 项目 | 之前 | 之后 |
|------|------|------|
| 班组控件 | `<Input>` 自由文本 | `<Select>` 下拉，4 个固定选项 |
| 选项 | 无 | EM / 监理 / 中闽大秦总包 / 中闽大秦分包 |
| 分包逻辑 | 无 | 选"中闽大秦分包"后，**动态出现**"具体班组名称"输入框（带 * 必填） |
| 校验 | `!team` 就报错 | `!team` 报错；`team === "中闽大秦分包" && !team_detail` 额外报错 |
| 提交 payload | `team: "一车间A班"` | `team: "中闽大秦分包·电气一班"`（合并）或 `team: "EM"`（直接） |
| 切换选项 | 无 | 切换班组时**自动清空** team_detail，避免脏数据 |

### 数据兼容
- **后端零改动**：`/api/exams/[id]/public` 直接存 `team` 字符串
- **管理后台零改动**：记录列表 / 详情 / 导出都直接显示 `team` 字段
- 历史数据（自由文本如"一车间A班"）照常显示，不受影响
- 新数据格式示例：
  - `EM`
  - `监理`
  - `中闽大秦总包`
  - `中闽大秦分包·电气一班` ← 分包场景

### 影响文件
- `src/app/exam/[id]/page.tsx`：
  - 新增 `TEAM_OPTIONS` 常量 + `Select` 组件导入
  - `form` 新增 `team_detail` 字段
  - 校验 + payload 合并 + UI 动态渲染
- `package.json` version 2.1.6 → 2.1.7

---

## v2.1.8 · 2026-07-16

**题库生成去重 + 题库扩容（用户反馈"很多类似题目"）**

### 背景
- 用户反馈：考试试题生成有很多类似的题目
- 根因分析：
  1. **AI 跨批次生成相似题**：Prompt 只说"请生成 5 道与其他批次不重复的题目"，但代码层没有任何去重检查，AI 可能 8 批都在出类似场景的题
  2. **题库总量偏小**：8 批 × 5 题 = 40 题，A 卷抽 20 题（用到一半题库），换个人考很容易碰到一样的题

### 本次变更

**1. 题库扩容：8 批 → 10 批**
- 简易题库：40 题 → **50 题**（30 单选 + 20 判断）
- 中等题库：40 题 → **50 题**（20 单选 + 20 多选 + 10 判断）
- 试卷配置不变（A 卷 20 题 / B 卷 20 题），**抽中率从 50% 降到 40%**

**2. Prompt 强化多样性**
- `EASY_BATCH_PROMPT` / `MEDIUM_BATCH_PROMPT` 新增第 3/4 条：
  > "5 道题必须覆盖 5 个完全不同的知识点/场景，禁止围绕同一主题反复出题"
- `userPrompt` 新增【去重强制规则】3 条：
  1. 本批 5 道题必须从材料的【不同章节/不同知识点/不同风险场景】切入
  2. 题干场景、人物、情节必须与之前批次完全不同（举例说明）
  3. 优先覆盖尚未出题的章节

**3. 代码层内容去重**
- `handleFinalize` 插入前查询已有题目，归一化内容后比对
- 过滤掉与已有题目**完全相同**的新题（去除标点/空格/大小写后比对）
- 同批次内也互相去重
- 日志输出：`+5 题（去重前 5）` 或 `+3 题（去重前 5）`

### 影响文件
- `src/app/api/materials/[id]/questions/route.ts`：
  - `TOTAL_BATCHES` 8 → 10
  - `EASY_BATCH_PROMPT` / `MEDIUM_BATCH_PROMPT` 加多样性要求
  - `userPrompt` 加【去重强制规则】
  - `handleFinalize` 加内容去重逻辑
- `package.json` version 2.1.7 → 2.1.8

### 效果预期
- 题库从 40 → 50 题，**单人重复率下降 20%**
- AI 被强制要求每批覆盖不同知识点，**跨批次相似度大幅下降**
- 代码层兜底去重，**完全相同的题目不再入库**

---

## v2.1.6 · 2026-07-16

**提纲生成的备注框视觉统一到题库（用户反馈"没落实"）**

### 背景
- v2.1.2 时，其实提纲生成已经加了 `NoteComposer`（空态直接可见 + 非空态藏在灰底小 details），但视觉太隐蔽。
- 用户反馈："提纲生成，你是不是也要添加相应的题库生成要求填写框？一样的道理啊。为什么没有一起去落实呢？"
- 确认：功能是在的，但**入口视觉与题库不一致**，用户找不到 = 等同于没做。

### 本次变更
**提纲卡片的备注框视觉全面对齐题库卡片**：

| 位置 | 之前 | 之后 |
|------|------|------|
| **空态**（暂无提纲） | NoteComposer 直接铺开、无卡片容器 | **白底 rounded-xl 卡片 + Sparkles 图标 + "已设定"badge** · 默认 `open` 展开 |
| **非空态**（已有提纲） | 灰底 slate-50 · text-xs · 小字号 · 极不明显 | **白底 rounded-xl 卡片 + Sparkles 图标 + "已设定"badge** · 与题库完全一致 |
| **NoteComposer 内部** | 默认收起（两层折叠糟糕体验） | **默认展开**（外层 details 已控制可见性） |

### 效果
- 三处备注框（工人版提纲、培训师版提纲、题库）现在**视觉完全一致**：
  - 白底卡片 + shadow-sm + rounded-xl
  - Sparkles 蓝色图标 + "生成要求（选填）" 标题
  - 有内容时右侧"已设定"badge 提示
  - 展开后直接看到 5 个预设模板 + Textarea + 说明
- 用户扫一眼就能找到入口，不再有"落地不彻底"的感觉

### 影响文件
- `src/app/admin/materials/[id]/page.tsx`：`OutlineCard` 空态 + 非空态两处备注框重构；`NoteComposer` 默认 expanded=true
- `package.json` version 2.1.5 → 2.1.6

---

## v2.1.5 · 2026-07-16

**修复：部署 `BuildGitCode timeout` — 从 git 剔除 IDE 对话截图**

### 现象
```
2026-07-16T15:14:52+08:00 info: [launch] Starting deployment
2026-07-16T15:34:52+08:00 error: [package] [code] BuildGitCode timeout (20 分钟)
2026-07-16T15:34:52+08:00 error: [launch] Deployment failed: pipeline execution timeout
```
部署平台在"拉取代码"阶段 20 分钟超时。

### 根因
- IDE 会话里的对话截图落到 `assets/` 目录，被误纳入 git 追踪。
- 至 v2.1.4 累计 20 张截图，共 **5.4MB**，占仓库追踪空间的 **83%**。
- 虽然 5MB 单看不大，但反复推拉 + 平台构建资源紧张情况下会显著拖慢 `BuildGitCode` 阶段。

### 修复
- **加固 `.gitignore`**：
  - 全局排除图片文件（`*.png` `*.jpg` `*.jpeg` `*.gif` `*.webp` `*.bmp` `*.tiff` `*.ico`）
  - 白名单例外：`public/` 目录下的图片（产品静态素材）
- **`git rm --cached` 从索引移除 20 张 assets 截图**（本地保留，不会消失，只是不再入库）
- **保留** `assets/迭代需求_v2_自动发布+专业化.md`（重要需求文档）

### 效果
| 指标 | 之前 | 之后 | 变化 |
|------|------|------|------|
| 追踪文件总大小 | 6.35 MB | 1.05 MB | **-83%** |
| 单次拉码传输量 | 大 | 小 | 显著加快 |
| 未来对话截图影响 | 每次 +数百 KB | 0 | 已阻断 |

### 影响文件
- `.gitignore`（加图片全局忽略 + public 白名单）
- 从索引删除 `assets/*.png` × 20
- `package.json` version 2.1.4 → 2.1.5

### 备注
- **不重写 git 历史**（保留 v1.0.0 ~ v2.1.4 完整可回溯）
- 历史提交里的 5MB 截图仍在 `.git/objects/`，但不再进入未来的拉取传输主路径
- 若下次部署仍超时，属于平台侧问题（网络/资源），需另行排查

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
