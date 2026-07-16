# 版本历史 · 智慧培训考试平台

本文档记录每次重大迭代，配合 git tag 使用。任意时刻可回溯到历史版本。

---

## 版本命名规则

- **v1.x.x** — 简单版本（智慧培训考试单体版）
- **v2.x.x** — 培训矩阵体系版（人 + 课 + 责任 + 时效 + 复盘 全闭环）
  - `v2.0.0-step1` ~ `v2.0.0-step6` — 分步交付节点
  - `v2.0.0` — 整合完成的正式版
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

## v2.0.0-step1 · 2026-07-16

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
