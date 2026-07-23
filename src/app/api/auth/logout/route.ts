import { NextRequest, NextResponse } from "next/server"
import { clearSessionCookie, getSession } from "@/lib/auth"
import { logOperation, getClientIp, getUserAgent, OperationAction } from "@/lib/operation-log"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
	// 获取当前用户信息用于日志记录
	const session = await getSession().catch(() => null)
	
	await clearSessionCookie()
	
	// 记录登出日志
	if (session) {
		logOperation({
			userId: session.id,
			userName: session.real_name || session.username,
			action: OperationAction.LOGOUT,
			ipAddress: getClientIp(req),
			userAgent: getUserAgent(req),
		})
	}
	
	return NextResponse.json({ ok: true })
}
