import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
const supabase = db()
import { authErrorResponse, hashPassword, requireAdmin } from "@/lib/auth"

export const runtime = "nodejs"

export async function GET() {
	try {
		await requireAdmin()
		const { data } = await supabase
			.from("users")
			.select("id,username,role,real_name,department,avatar_color,active,last_login_at,created_at")
			.order("created_at", { ascending: false })
		return NextResponse.json({ items: data ?? [] })
	} catch (e) {
		const r = authErrorResponse(e)
		if (r) return r
		return NextResponse.json({ error: (e as Error).message }, { status: 500 })
	}
}

export async function POST(req: NextRequest) {
	try {
		await requireAdmin()
		const body = await req.json()
		const username = String(body.username || "").trim()
		const password = String(body.password || "")
		const role = body.role === "admin" ? "admin" : "user"
		const real_name = String(body.real_name || username)
		const department = body.department ? String(body.department) : null
		const avatar_color = body.avatar_color ? String(body.avatar_color) : "#1677ff"

		if (!username || !password) return NextResponse.json({ error: "账号与密码必填" }, { status: 400 })
		if (password.length < 6) return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 })

		const { data: exists } = await supabase.from("users").select("id").eq("username", username).maybeSingle()
		if (exists) return NextResponse.json({ error: "账号已存在" }, { status: 400 })

		const { data, error } = await supabase
			.from("users")
			.insert({
				username,
				password_hash: hashPassword(password),
				role,
				real_name,
				department,
				avatar_color,
				active: true,
			})
			.select()
			.single()
		if (error) throw error
		return NextResponse.json({ item: data })
	} catch (e) {
		const r = authErrorResponse(e)
		if (r) return r
		return NextResponse.json({ error: (e as Error).message }, { status: 500 })
	}
}
