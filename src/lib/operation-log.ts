import { db } from "@/lib/db";

export interface LogOperationParams {
	userId?: string | null;
	userName?: string | null;
	action: string; // login, logout, create, update, delete, import, export, generate
	targetType?: string; // materials, question_banks, exams, workers, users
	targetId?: string;
	detail?: Record<string, unknown>;
	ipAddress?: string | null;
	userAgent?: string | null;
}

/**
 * 记录操作日志
 * 异步执行，不阻塞主流程
 */
export function logOperation(params: LogOperationParams): void {
	// 异步执行，不阻塞主流程
	setImmediate(async () => {
		try {
			const client = db();
			await client.from("operation_logs").insert({
				user_id: params.userId || null,
				user_name: params.userName || null,
				action: params.action,
				target_type: params.targetType || null,
				target_id: params.targetId || null,
				detail: params.detail || null,
				ip_address: params.ipAddress || null,
				user_agent: params.userAgent || null,
			});
		} catch (error) {
			// 日志记录失败不影响主流程
			console.error("[OperationLog] Failed to log operation:", error);
		}
	});
}

/**
 * 从请求中提取 IP 地址
 */
export function getClientIp(request: Request): string | null {
	const forwarded = request.headers.get("x-forwarded-for");
	if (forwarded) {
		return forwarded.split(",")[0].trim();
	}
	const realIp = request.headers.get("x-real-ip");
	if (realIp) {
		return realIp;
	}
	return null;
}

/**
 * 从请求中提取 User Agent
 */
export function getUserAgent(request: Request): string | null {
	return request.headers.get("user-agent");
}

/**
 * 操作类型常量
 */
export const OperationAction = {
	// 认证相关
	LOGIN: "login",
	LOGOUT: "logout",
	
	// 培训材料
	MATERIAL_UPLOAD: "material_upload",
	MATERIAL_DELETE: "material_delete",
	MATERIAL_PARSE: "material_parse",
	
	// 题库
	BANK_CREATE: "bank_create",
	BANK_DELETE: "bank_delete",
	QUESTION_CREATE: "question_create",
	QUESTION_DELETE: "question_delete",
	QUESTION_GENERATE: "question_generate",
	
	// 试卷
	EXAM_CREATE: "exam_create",
	EXAM_DELETE: "exam_delete",
	
	// 花名册
	WORKER_IMPORT: "worker_import",
	WORKER_DELETE: "worker_delete",
	
	// 用户管理
	USER_CREATE: "user_create",
	USER_DELETE: "user_delete",
	USER_UPDATE: "user_update",
	
	// 提纲
	OUTLINE_GENERATE: "outline_generate",
} as const;

export type OperationActionType = typeof OperationAction[keyof typeof OperationAction];
