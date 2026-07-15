import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
const supabase = db()
import { getSession, hashPassword, verifyPassword, authErrorResponse } from "@/lib/auth"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
	try {
		const me = await getSession()
		if (!me) return NextResponse.json({ error: "未登录" }, { status: 401 })

		const { oldPassword, newPassword } = await req.json()
		if (!oldPassword || !newPassword) {
			return NextResponse.json({ error: "请填写原密码和新密码" }, { status: 400 })
		}
		if (typeof newPassword !== "string" || newPassword.length < 6) {
			return NextResponse.json({ error: "新密码至少6位" }, { status: 400 })
		}

		const { data: user, error } = await supabase
			.from("users")
			.select("password_hash")
			.eq("id", me.id)
			.single()
		if (error) throw error

		if (!verifyPassword(oldPassword, user.password_hash)) {
			return NextResponse.json({ error: "原密码不正确" }, { status: 400 })
		}

		const { error: updErr } = await supabase
			.from("users")
			.update({ password_hash: hashPassword(newPassword) })
			.eq("id", me.id)
		if (updErr) throw updErr

		return NextResponse.json({ ok: true })
	} catch (e) {
		const r = authErrorResponse(e)
		if (r) return r
		return NextResponse.json({ error: (e as Error).message }, { status: 500 })
	}
}
