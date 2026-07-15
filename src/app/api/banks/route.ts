import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/banks?material_id=xxx&status=draft|published
export async function GET(req: NextRequest) {
  const materialId = req.nextUrl.searchParams.get("material_id");
  const status = req.nextUrl.searchParams.get("status");
  const session = await getSession();
  const client = db();
  let query = client
    .from("question_banks")
    .select("id, material_id, title, difficulty, total_count, status, owner_id, published_at, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (materialId) query = query.eq("material_id", materialId);
  if (status === "draft" || status === "published") query = query.eq("status", status);
  // 普通用户只看自己的题库
  if (session && session.role === "user") query = query.eq("owner_id", session.id);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

// POST /api/banks  手动创建题库（默认 draft）
export async function POST(req: NextRequest) {
  const session = await getSession();
  const body = await req.json().catch(() => ({}));
  const { title, difficulty, material_id, status } = body as {
    title?: string;
    difficulty?: string;
    material_id?: string;
    status?: string;
  };
  if (!title || !difficulty) {
    return NextResponse.json({ error: "title/difficulty 必填" }, { status: 400 });
  }
  const id = `bnk_${Date.now().toString(36)}`;
  const client = db();
  const { data, error } = await client
    .from("question_banks")
    .insert({
      id,
      title,
      difficulty,
      material_id: material_id || null,
      total_count: 0,
      status: status === "published" ? "published" : "draft",
      owner_id: session?.id ?? null,
    })
    .select("id, material_id, title, difficulty, total_count, status, owner_id, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
