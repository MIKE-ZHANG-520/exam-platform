import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
const supabase = db()
import { hashPassword, setSessionCookie, signSession, verifyPassword } from "@/lib/auth"

export const runtime = "nodejs"

async function ensureDefaultAdmin() {
	const { count } = await supabase.from("users").select("id", { count: "exact", head: true })
	if (!count || count === 0) {
		await supabase.from("users").insert({
			username: "admin",
			password_hash: hashPassword("admin123"),
			role: "admin",
			real_name: "系统管理员",
			department: "总部",
			avatar_color: "#1677ff",
			active: true,
		})
		await supabase.from("users").insert({
			username: "trainer",
			password_hash: hashPassword("trainer123"),
			real_name: "培训主管",
			role: "user",
			department: "生产一部",
			avatar_color: "#f97316",
			active: true,
		})
	}
}

export async function POST(req: NextRequest) {
	await ensureDefaultAdmin()
	const body = await req.json()
	const username = String(body.username || "").trim()
	const password = String(body.password || "")
	const remember = Boolean(body.remember)

	if (!username || !password) {
		return NextResponse.json({ error: "账号或密码不能为空" }, { status: 400 })
	}

	const { data } = await supabase.from("users").select("*").eq("username", username).eq("active", true).maybeSingle()
	if (!data) return NextResponse.json({ error: "账号或密码错误" }, { status: 401 })
	if (!verifyPassword(password, data.password_hash)) {
		return NextResponse.json({ error: "账号或密码错误" }, { status: 401 })
	}

	const token = await signSession(
		{
			id: data.id,
			username: data.username,
			role: data.role,
			real_name: data.real_name,
			department: data.department,
		},
		remember,
	)
	await setSessionCookie(token, remember)
	await supabase.from("users").update({ last_login_at: new Date().toISOString() }).eq("id", data.id)

	return NextResponse.json({
		user: {
			id: data.id,
			username: data.username,
			role: data.role,
			real_name: data.real_name,
			department: data.department,
			avatar_color: data.avatar_color,
		},
	})
}
