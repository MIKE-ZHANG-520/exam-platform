import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
const supabase = db()
import { authErrorResponse, hashPassword, requireAdmin } from "@/lib/auth"

export const runtime = "nodejs"

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
	try {
		await requireAdmin()
		const { id } = await ctx.params
		const body = await req.json()
		const update: Record<string, unknown> = {}
		if (typeof body.real_name === "string") update.real_name = body.real_name
		if (typeof body.department === "string") update.department = body.department
		if (typeof body.role === "string" && (body.role === "admin" || body.role === "user")) update.role = body.role
		if (typeof body.active === "boolean") update.active = body.active
		if (typeof body.avatar_color === "string") update.avatar_color = body.avatar_color
		if (typeof body.password === "string" && body.password.length >= 6) update.password_hash = hashPassword(body.password)

		const { data, error } = await supabase.from("users").update(update).eq("id", id).select().single()
		if (error) throw error
		return NextResponse.json({ item: data })
	} catch (e) {
		const r = authErrorResponse(e)
		if (r) return r
		return NextResponse.json({ error: (e as Error).message }, { status: 500 })
	}
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
	try {
		const me = await requireAdmin()
		const { id } = await ctx.params
		if (id === me.id) return NextResponse.json({ error: "不能删除自己" }, { status: 400 })
		await supabase.from("users").delete().eq("id", id)
		return NextResponse.json({ ok: true })
	} catch (e) {
		const r = authErrorResponse(e)
		if (r) return r
		return NextResponse.json({ error: (e as Error).message }, { status: 500 })
	}
}
