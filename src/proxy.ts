import { NextRequest, NextResponse } from "next/server"
import { jwtVerify } from "jose"
import { createHash } from "crypto"
import { loadEnv } from "@/storage/database/supabase-client"

// 与 auth.ts 保持相同的密钥计算逻辑
function getSecret(): string {
  const envSecret = process.env.SESSION_SECRET
  if (envSecret) return envSecret
  // 尝试加载环境变量（COZE_SUPABASE_URL 由沙箱平台注入，需通过 loadEnv 获取）
  try { loadEnv() } catch { /* ignore */ }
  const source = process.env.COZE_SUPABASE_URL || "smart-training-platform-2026"
  return createHash("sha256").update(`session-secret::${source}`).digest("hex")
}
let _key: Uint8Array | null = null
function getKey(): Uint8Array {
  if (_key) return _key
  _key = new TextEncoder().encode(getSecret())
  return _key
}

// 公开路径：登录页、登录接口、扫码考试相关、评价、静态资源、外部解析API
const PUBLIC_API_PATTERNS = [
	/^\/api\/warmup$/,
	/^\/api\/auth\/login$/,
	/^\/api\/auth\/logout$/,
	/^\/api\/exams\/[^/]+\/public$/,
	/^\/api\/records\/[^/]+\/submit$/,
	/^\/api\/records\/[^/]+\/evaluate$/,
	/^\/api\/records\/[^/]+$/, // 允许考试端读取自己的记录（GET/PATCH 切屏上报）
	/^\/api\/parse\/queue$/, // 外部解析队列API（使用X-Parse-Token认证）
	/^\/api\/materials\/[^/]+\/parse-result$/, // 外部解析结果回写API（使用X-Parse-Token认证）
	/^\/api\/worker\/queue$/, // 统一Worker队列API（使用X-Worker-Token认证）
	/^\/api\/worker\/tasks\/[^/]+\/result$/, // 统一Worker结果回写API（使用X-Worker-Token认证）
]

async function verify(token: string) {
	try {
		const { payload } = await jwtVerify(token, getKey())
		return payload
	} catch {
		return null
	}
}

export async function proxy(req: NextRequest) {
	const { pathname } = req.nextUrl
	const token = req.cookies.get("session")?.value

	// 已登录访问 /login → 跳转到看板
	if (pathname === "/login") {
		if (token) {
			const payload = await verify(token)
			if (payload) {
				const url = req.nextUrl.clone()
				url.pathname = "/admin/dashboard"
				return NextResponse.redirect(url)
			}
		}
		return NextResponse.next()
	}

	// 保护 /admin/*
	if (pathname.startsWith("/admin")) {
		if (!token || !(await verify(token))) {
			const url = req.nextUrl.clone()
			url.pathname = "/login"
			url.searchParams.set("from", pathname)
			return NextResponse.redirect(url)
		}
		return NextResponse.next()
	}

	// 保护 /api/*（排除公开路径）
	if (pathname.startsWith("/api")) {
		const isPublic = PUBLIC_API_PATTERNS.some((p) => p.test(pathname))
		if (isPublic) return NextResponse.next()
		if (!token || !(await verify(token))) {
			return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
		}
	}

	return NextResponse.next()
}

export const config = {
	matcher: ["/admin/:path*", "/login", "/api/:path*"],
}
