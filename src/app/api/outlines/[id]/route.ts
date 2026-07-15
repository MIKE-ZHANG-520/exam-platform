import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
const supabase = db()

export const runtime = "nodejs"

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
	const { id } = await ctx.params
	const { data, error } = await supabase.from("outlines").select("*").eq("id", id).maybeSingle()
	if (error) return NextResponse.json({ error: error.message }, { status: 500 })
	if (!data) return NextResponse.json({ error: "提纲不存在" }, { status: 404 })
	return NextResponse.json({ outline: data })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
	const { id } = await ctx.params
	const body = await req.json()
	const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
	if (typeof body.content_md === "string") update.content_md = body.content_md
	if (typeof body.title === "string") update.title = body.title
	if (body.status === "draft" || body.status === "published") {
		update.status = body.status
		if (body.status === "published") update.published_at = new Date().toISOString()
	}
	const { data, error } = await supabase.from("outlines").update(update).eq("id", id).select().single()
	if (error) return NextResponse.json({ error: error.message }, { status: 500 })
	return NextResponse.json({ outline: data })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
	const { id } = await ctx.params
	const { error } = await supabase.from("outlines").delete().eq("id", id)
	if (error) return NextResponse.json({ error: error.message }, { status: 500 })
	return NextResponse.json({ ok: true })
}
