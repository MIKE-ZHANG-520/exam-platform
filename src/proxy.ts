import { NextRequest, NextResponse } from "next/server"
import { jwtVerify } from "jose"

const SECRET = process.env.SESSION_SECRET || "smart-training-platform-default-secret-change-me-2026"
const key = new TextEncoder().encode(SECRET)

// 公开路径：登录页、登录接口、扫码考试相关、评价、静态资源
const PUBLIC_API_PATTERNS = [
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
