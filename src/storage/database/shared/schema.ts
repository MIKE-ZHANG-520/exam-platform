import { pgTable, serial, timestamp, varchar, text, integer, jsonb, boolean, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

// 保留系统表，禁止删除
export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 用户表（登录鉴权）
export const users = pgTable(
	"users",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		username: varchar("username", { length: 60 }).notNull().unique(),
		password_hash: varchar("password_hash", { length: 255 }).notNull(),
		role: varchar("role", { length: 20 }).notNull().default("user"), // admin / user
		real_name: varchar("real_name", { length: 60 }).notNull(),
		department: varchar("department", { length: 100 }),
		avatar_color: varchar("avatar_color", { length: 20 }),
		active: boolean("active").notNull().default(true),
		last_login_at: timestamp("last_login_at", { withTimezone: true }),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("users_username_idx").on(table.username),
		index("users_role_idx").on(table.role),
	]
);

// 培训材料表
export const materials = pgTable(
	"materials",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		title: varchar("title", { length: 255 }).notNull(),
		file_name: varchar("file_name", { length: 500 }).notNull(),
		file_type: varchar("file_type", { length: 20 }).notNull(), // docx/xlsx/pdf/pptx/md
		file_key: varchar("file_key", { length: 500 }).notNull(),   // 对象存储 key
		file_size: integer("file_size").notNull().default(0),
		content_text: text("content_text"),                          // 解析后的文本
		status: varchar("status", { length: 20 }).notNull().default("uploaded"),
		// uploaded / parsing / parsed / generating / ready / failed
		error_message: text("error_message"),
		metadata: jsonb("metadata"),                                  // AI 提取的元数据（法规、条款、风险等级、适用岗位）
		owner_id: varchar("owner_id", { length: 36 }),                // 创建人（用于普通管理员的数据隔离）
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("materials_status_idx").on(table.status),
		index("materials_created_at_idx").on(table.created_at),
	]
);

// 培训提纲表（一个材料可能有工人版 / 培训师版两条）
export const outlines = pgTable(
	"outlines",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		material_id: varchar("material_id", { length: 36 }).notNull().references(() => materials.id, { onDelete: "cascade" }),
		audience: varchar("audience", { length: 20 }).notNull(), // worker / trainer
		title: varchar("title", { length: 255 }),
		content_md: text("content_md").notNull(),                // markdown 提纲全文
		status: varchar("status", { length: 20 }).notNull().default("draft"), // draft / published
		published_at: timestamp("published_at", { withTimezone: true }),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("outlines_material_id_idx").on(table.material_id),
		index("outlines_audience_idx").on(table.audience),
	]
);

// 题库表（一个材料可能有简易 / 中等两个题库）
export const question_banks = pgTable(
	"question_banks",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		material_id: varchar("material_id", { length: 36 }),
		title: varchar("title", { length: 255 }).notNull(),
		difficulty: varchar("difficulty", { length: 20 }).notNull(), // easy / medium
		total_count: integer("total_count").notNull().default(0),
		status: varchar("status", { length: 20 }).notNull().default("draft"), // draft / published
		owner_id: varchar("owner_id", { length: 36 }),
		published_at: timestamp("published_at", { withTimezone: true }),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("question_banks_material_id_idx").on(table.material_id),
		index("question_banks_status_idx").on(table.status),
	]
);

// 题目表
export const questions = pgTable(
	"questions",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		bank_id: varchar("bank_id", { length: 36 }).notNull().references(() => question_banks.id, { onDelete: "cascade" }),
		type: varchar("type", { length: 20 }).notNull(),        // single / multiple / judge
		content: text("content").notNull(),                     // 题干
		options: jsonb("options").notNull(),                    // [{key:'A', text:'...'}, ...] 判断题也是 [A:正确,B:错误]
		answer: jsonb("answer").notNull(),                      // ['A'] 或 ['A','C'] 或 ['A']
		explanation: text("explanation"),                       // 答案解析
		order_no: integer("order_no").notNull().default(0),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("questions_bank_id_idx").on(table.bank_id),
		index("questions_type_idx").on(table.type),
	]
);

// 试卷表
export const exams = pgTable(
	"exams",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		title: varchar("title", { length: 255 }).notNull(),
		bank_id: varchar("bank_id", { length: 36 }).notNull().references(() => question_banks.id, { onDelete: "cascade" }),
		paper_type: varchar("paper_type", { length: 10 }).notNull(), // A / B
		duration_min: integer("duration_min").notNull().default(20), // 分钟
		pass_score: integer("pass_score").notNull().default(80),
		total_score: integer("total_score").notNull().default(100),
		max_attempts: integer("max_attempts").notNull().default(2),
		// 配置：每次抽题数量与规则 { single: 10, multiple: 0, judge: 10 }
		config: jsonb("config").notNull(),
		// 必填的考生信息字段：{name:true, phone:true, team:true, id_card:true}
		required_fields: jsonb("required_fields"),
		status: varchar("status", { length: 20 }).notNull().default("active"), // active / archived
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("exams_bank_id_idx").on(table.bank_id),
		index("exams_status_idx").on(table.status),
	]
);

// 考试记录
export const exam_records = pgTable(
	"exam_records",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		exam_id: varchar("exam_id", { length: 36 }).notNull().references(() => exams.id, { onDelete: "cascade" }),
		// 考生信息
		candidate_name: varchar("candidate_name", { length: 100 }).notNull(),
		phone: varchar("phone", { length: 30 }),
		team: varchar("team", { length: 100 }),
		id_card_encrypted: varchar("id_card_encrypted", { length: 255 }), // 加密后的身份证号
		id_card_mask: varchar("id_card_mask", { length: 30 }),            // 脱敏展示，如 3301**********1234
		// 试卷快照：题目id列表 + 每题选项顺序打乱后的映射，避免题库变更影响历史卷
		paper_snapshot: jsonb("paper_snapshot").notNull(),
		// 用户答案：{questionId: ['A','C'], ...}
		answers: jsonb("answers"),
		score: integer("score"),
		is_pass: boolean("is_pass"),
		attempt_no: integer("attempt_no").notNull().default(1),
		status: varchar("status", { length: 20 }).notNull().default("ongoing"),
		// ongoing / submitted / auto_submitted / abandoned
		switch_count: integer("switch_count").notNull().default(0), // 切屏次数
		duration_sec: integer("duration_sec"),                      // 实际用时秒
		started_at: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
		submitted_at: timestamp("submitted_at", { withTimezone: true }),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("exam_records_exam_id_idx").on(table.exam_id),
		index("exam_records_phone_idx").on(table.phone),
		index("exam_records_team_idx").on(table.team),
		index("exam_records_is_pass_idx").on(table.is_pass),
		index("exam_records_created_at_idx").on(table.created_at),
	]
);

// 讲师评价
export const evaluations = pgTable(
	"evaluations",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		record_id: varchar("record_id", { length: 36 }).notNull().references(() => exam_records.id, { onDelete: "cascade" }),
		exam_id: varchar("exam_id", { length: 36 }).notNull().references(() => exams.id, { onDelete: "cascade" }),
		// 5 维度评分 1-5
		score_content: integer("score_content").notNull().default(0),
		score_clarity: integer("score_clarity").notNull().default(0),
		score_interaction: integer("score_interaction").notNull().default(0),
		score_time: integer("score_time").notNull().default(0),
		score_overall: integer("score_overall").notNull().default(0),
		comment: text("comment"),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("evaluations_exam_id_idx").on(table.exam_id),
		index("evaluations_record_id_idx").on(table.record_id),
	]
);
