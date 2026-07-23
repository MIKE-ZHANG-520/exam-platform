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
		// pending / uploaded / parsing / parsed / generating / ready / failed
		parse_source: varchar("parse_source", { length: 20 }).default("internal"), // internal / external
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
		generation_note: text("generation_note"),                // 生成时的教研备注（用户输入）
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
		generation_note: text("generation_note"),                // 生成时的教研备注（用户输入）
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

// ==================== 培训矩阵体系 · 第一层：组织维度 ====================

// 项目/工程表
export const projects = pgTable(
	"projects",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		name: varchar("name", { length: 200 }).notNull(),
		code: varchar("code", { length: 60 }).unique(),           // 项目编号（可选，唯一）
		location: varchar("location", { length: 255 }),           // 所在地
		manager: varchar("manager", { length: 60 }),              // 项目负责人姓名
		manager_phone: varchar("manager_phone", { length: 30 }),  // 负责人手机
		start_date: varchar("start_date", { length: 10 }),        // 开工日期 YYYY-MM-DD
		end_date: varchar("end_date", { length: 10 }),            // 竣工日期
		status: varchar("status", { length: 20 }).notNull().default("active"),
		// active / paused / finished / archived
		description: text("description"),
		metadata: jsonb("metadata"),                              // 扩展字段
		owner_id: varchar("owner_id", { length: 36 }),            // 创建人
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("projects_status_idx").on(table.status),
		index("projects_name_idx").on(table.name),
	],
);

// 班组表
export const teams = pgTable(
	"teams",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		project_id: varchar("project_id", { length: 36 }).notNull().references(() => projects.id, { onDelete: "cascade" }),
		name: varchar("name", { length: 100 }).notNull(),         // 班组名称
		leader: varchar("leader", { length: 60 }),                // 班组长姓名
		leader_phone: varchar("leader_phone", { length: 30 }),
		main_work_type: varchar("main_work_type", { length: 60 }),// 主要工种
		member_count: integer("member_count").notNull().default(0), // 缓存人数，写入 worker 时更新
		status: varchar("status", { length: 20 }).notNull().default("active"),
		// active / disbanded
		description: text("description"),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("teams_project_id_idx").on(table.project_id),
		index("teams_status_idx").on(table.status),
	],
);

// 工人花名册
export const workers = pgTable(
	"workers",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		name: varchar("name", { length: 60 }).notNull(),
		gender: varchar("gender", { length: 10 }),                // 男/女
		birth_year: integer("birth_year"),                        // 出生年
		phone: varchar("phone", { length: 30 }),
		id_card_encrypted: varchar("id_card_encrypted", { length: 255 }).notNull().unique(),
		id_card_mask: varchar("id_card_mask", { length: 30 }).notNull(),
		id_card_hash: varchar("id_card_hash", { length: 64 }).notNull().unique(),
		// SHA-256(id_card) 用于查重和查询（加密后每次不同，无法直接用密文查询）
		work_type: varchar("work_type", { length: 60 }),          // 工种
		project_id: varchar("project_id", { length: 36 }).references(() => projects.id, { onDelete: "set null" }),
		team_id: varchar("team_id", { length: 36 }).references(() => teams.id, { onDelete: "set null" }),
		hire_date: varchar("hire_date", { length: 10 }),          // 入职日期
		leave_date: varchar("leave_date", { length: 10 }),        // 离职日期
		status: varchar("status", { length: 20 }).notNull().default("active"),
		// active / left（离职）/ transferred（借调）
		emergency_contact: varchar("emergency_contact", { length: 60 }),
		emergency_phone: varchar("emergency_phone", { length: 30 }),
		health_cert_expires_at: varchar("health_cert_expires_at", { length: 10 }), // 健康证有效期
		remark: text("remark"),
		metadata: jsonb("metadata"),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("workers_project_id_idx").on(table.project_id),
		index("workers_team_id_idx").on(table.team_id),
		index("workers_work_type_idx").on(table.work_type),
		index("workers_status_idx").on(table.status),
		index("workers_name_idx").on(table.name),
		index("workers_phone_idx").on(table.phone),
		index("workers_id_card_hash_idx").on(table.id_card_hash),
	],
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

// ==================== 安全管理体系 ====================

// 工人入场档案（一人一档）
export const worker_profiles = pgTable(
	"worker_profiles",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		worker_id: varchar("worker_id", { length: 36 }).notNull().unique().references(() => workers.id, { onDelete: "cascade" }),
		// 身份证信息
		id_card_front_url: varchar("id_card_front_url", { length: 500 }),  // 身份证正面照片
		id_card_back_url: varchar("id_card_back_url", { length: 500 }),    // 身份证反面照片
		// 特种作业证
		special_cert_type: varchar("special_cert_type", { length: 60 }),   // 电工/焊工/架子工等
		special_cert_no: varchar("special_cert_no", { length: 100 }),      // 证件编号
		special_cert_issue_date: varchar("special_cert_issue_date", { length: 10 }),
		special_cert_expire_date: varchar("special_cert_expire_date", { length: 10 }),
		special_cert_url: varchar("special_cert_url", { length: 500 }),    // 证件照片
		// 体检报告
		health_report_url: varchar("health_report_url", { length: 500 }),
		health_check_date: varchar("health_check_date", { length: 10 }),
		// 审核状态
		status: varchar("status", { length: 20 }).notNull().default("pending"),
		// pending / approved / rejected
		reject_reason: text("reject_reason"),
		reviewed_by: varchar("reviewed_by", { length: 36 }),               // 审核人 ID
		reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
		// 二维码
		qr_code_url: varchar("qr_code_url", { length: 500 }),
		qr_code_generated: boolean("qr_code_generated").notNull().default(false),
		// 入场状态
		admission_status: varchar("admission_status", { length: 20 }).notNull().default("not_started"),
		// not_started / training / briefing / admitted
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("worker_profiles_worker_id_idx").on(table.worker_id),
		index("worker_profiles_status_idx").on(table.status),
		index("worker_profiles_admission_status_idx").on(table.admission_status),
	]
);

// 三级安全教育培训记录
export const safety_trainings = pgTable(
	"safety_trainings",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		worker_id: varchar("worker_id", { length: 36 }).notNull().references(() => workers.id, { onDelete: "cascade" }),
		level: varchar("level", { length: 20 }).notNull(),
		// company / project / team（公司级/项目级/班组级）
		training_date: varchar("training_date", { length: 10 }).notNull(),
		instructor: varchar("instructor", { length: 60 }).notNull(),       // 培训讲师
		instructor_phone: varchar("instructor_phone", { length: 30 }),
		duration_hours: integer("duration_hours").notNull().default(2),    // 培训时长（小时）
		content: text("content"),                                          // 培训内容
		certificate_url: varchar("certificate_url", { length: 500 }),      // 培训证书照片
		exam_passed: boolean("exam_passed").notNull().default(false),      // 是否通过考试
		exam_score: integer("exam_score"),                                 // 考试分数
		exam_record_id: varchar("exam_record_id", { length: 36 }),         // 关联考试记录
		remark: text("remark"),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("safety_trainings_worker_id_idx").on(table.worker_id),
		index("safety_trainings_level_idx").on(table.level),
		index("safety_trainings_training_date_idx").on(table.training_date),
	]
);

// 入场交底记录
export const safety_briefings = pgTable(
	"safety_briefings",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		worker_id: varchar("worker_id", { length: 36 }).notNull().references(() => workers.id, { onDelete: "cascade" }),
		briefing_date: varchar("briefing_date", { length: 10 }).notNull(),
		instructor: varchar("instructor", { length: 60 }).notNull(),       // 交底人
		instructor_phone: varchar("instructor_phone", { length: 30 }),
		content: text("content").notNull(),                                // 交底内容
		location: varchar("location", { length: 200 }),                    // 交底地点
		signature_url: varchar("signature_url", { length: 500 }),          // 工人签名照片
		witness: varchar("witness", { length: 60 }),                       // 见证人
		remark: text("remark"),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("safety_briefings_worker_id_idx").on(table.worker_id),
		index("safety_briefings_briefing_date_idx").on(table.briefing_date),
	]
);

// 专项培训记录（可选，用于记录额外的专项培训）
export const special_trainings = pgTable(
	"special_trainings",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		worker_id: varchar("worker_id", { length: 36 }).notNull().references(() => workers.id, { onDelete: "cascade" }),
		title: varchar("title", { length: 200 }).notNull(),                // 培训主题
		training_date: varchar("training_date", { length: 10 }).notNull(),
		instructor: varchar("instructor", { length: 60 }),
		duration_hours: integer("duration_hours").notNull().default(1),
		content: text("content"),
		certificate_url: varchar("certificate_url", { length: 500 }),
		remark: text("remark"),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("special_trainings_worker_id_idx").on(table.worker_id),
		index("special_trainings_training_date_idx").on(table.training_date),
	]
);

// 后台任务队列（统一异步任务管理）
export const background_tasks = pgTable(
	"background_tasks",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		type: varchar("type", { length: 30 }).notNull(), // parse_file, generate_questions, generate_outline, import_roster
		status: varchar("status", { length: 20 }).notNull().default("pending"), // pending, processing, completed, failed
		resource_type: varchar("resource_type", { length: 30 }).notNull(), // materials, question_banks, outlines, workers
		resource_id: varchar("resource_id", { length: 36 }).notNull(),
		payload: jsonb("payload"), // task parameters
		result: jsonb("result"), // task result
		error_message: text("error_message"),
		progress: jsonb("progress"), // { current, total, message }
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
		started_at: timestamp("started_at", { withTimezone: true }),
		completed_at: timestamp("completed_at", { withTimezone: true }),
	},
	(table) => [
		index("background_tasks_status_idx").on(table.status),
		index("background_tasks_type_idx").on(table.type),
		index("background_tasks_resource_idx").on(table.resource_type, table.resource_id),
	]
);

// 操作日志表
export const operation_logs = pgTable(
	"operation_logs",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		user_id: varchar("user_id", { length: 36 }),
		user_name: varchar("user_name", { length: 100 }),
		action: varchar("action", { length: 50 }).notNull(), // login, logout, create, update, delete, import, export, generate
		target_type: varchar("target_type", { length: 50 }), // materials, question_banks, exams, workers, users
		target_id: varchar("target_id", { length: 36 }),
		detail: jsonb("detail"), // 操作详情
		ip_address: varchar("ip_address", { length: 45 }),
		user_agent: text("user_agent"),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("operation_logs_user_id_idx").on(table.user_id),
		index("operation_logs_action_idx").on(table.action),
		index("operation_logs_created_at_idx").on(table.created_at),
		index("operation_logs_target_idx").on(table.target_type, table.target_id),
	]
);

// 人员入场资料表
export const person_materials = pgTable(
	"person_materials",
	{
		id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
		person_id: varchar("person_id", { length: 36 }).notNull(),
		category: varchar("category", { length: 30 }).notNull(), // general, safety_education, safety_briefing, other
		file_name: varchar("file_name", { length: 255 }).notNull(),
		file_type: varchar("file_type", { length: 20 }),
		file_key: varchar("file_key", { length: 500 }).notNull(),
		file_size: integer("file_size"),
		status: varchar("status", { length: 20 }).notNull().default("pending"), // pending, parsing, completed, failed
		parse_result: jsonb("parse_result"),
		error_message: text("error_message"),
		created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index("person_materials_person_id_idx").on(table.person_id),
		index("person_materials_category_idx").on(table.category),
		index("person_materials_status_idx").on(table.status),
	]
);
