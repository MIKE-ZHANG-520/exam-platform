import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// GET /api/banks?material_id=xxx
export async function GET(req: NextRequest) {
  const materialId = req.nextUrl.searchParams.get("material_id");
  const client = db();
  let query = client
    .from("question_banks")
    .select("id, material_id, title, difficulty, total_count, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (materialId) query = query.eq("material_id", materialId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

// POST /api/banks  手动创建题库
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { title, difficulty } = body as { title?: string; difficulty?: string };
  if (!title || !difficulty) {
    return NextResponse.json({ error: "title/difficulty 必填" }, { status: 400 });
  }
  const id = `bnk_${Date.now().toString(36)}`;
  const client = db();
  const { data, error } = await client
    .from("question_banks")
    .insert({ id, title, difficulty, total_count: 0 })
    .select("id, material_id, title, difficulty, total_count, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
