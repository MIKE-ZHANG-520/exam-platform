import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { db } from "@/lib/db"
const supabase = db()

export const runtime = "nodejs"

export async function GET() {
	const s = await getSession()
	if (!s) return NextResponse.json({ user: null }, { status: 200 })
	const { data } = await supabase.from("users").select("id,username,role,real_name,department,avatar_color").eq("id", s.id).maybeSingle()
	return NextResponse.json({ user: data ?? s })
}
