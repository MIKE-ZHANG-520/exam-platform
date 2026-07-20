import { NextRequest, NextResponse } from "next/server"
import { jwtVerify } from "jose"
import { createHash } from "crypto"

// 与 auth.ts 保持相同的密钥计算逻辑
function getSecret(): string {
  const envSecret = process.env.SESSION_SECRET
  if (envSecret) return envSecret
  const source = process.env.COZE_SUPABASE_URL || "smart-training-platform-2026"
  return createHash("sha256").update(`session-secret::${source}`).digest("hex")
}
const key = new TextEncoder().encode(getSecret())

// 公开路径：登录页、登录接口、扫码考试相关、评价、静态资源
const PUBLIC_API_PATTERNS = [
	/^\/api\/warmup$/,
	/^\/api\/auth\/login$/,
	/^\/api\/auth\/logout$/,
	/^\/api\/exams\/[^/]+\/public$/,
	/^\/api\/records\/[^/]+\/submit$/,
	/^\/api\/records\/[^/]+\/evaluate$/,
	/^\/api\/records\/[^/]+$/, // 允许考试端读取自己的记录（GET/PATCH 切屏上报）
]

async function verify(token: string) {
	try {
		const { payload } = await jwtVerify(token, key)
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
