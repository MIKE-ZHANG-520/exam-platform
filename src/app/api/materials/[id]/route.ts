import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { presignUrl } from "@/lib/storage";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const client = db();
  const { data, error } = await client
    .from("materials")
    .select("id, title, file_name, file_type, file_key, file_size, status, error_message, content_text, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "材料不存在" }, { status: 404 });

  // 顺带查询关联的提纲与题库
  const [outlinesRes, banksRes] = await Promise.all([
    client
      .from("outlines")
      .select("id, audience, content_md, created_at")
      .eq("material_id", id)
      .order("created_at", { ascending: false }),
    client
      .from("question_banks")
      .select("id, title, difficulty, total_count, created_at")
      .eq("material_id", id)
      .order("created_at", { ascending: false }),
  ]);

  let file_url: string | null = null;
  try {
    if (data.file_key) file_url = await presignUrl(data.file_key, 3600);
  } catch {
    file_url = null;
  }

  return NextResponse.json({
    material: { ...data, file_url },
    outlines: outlinesRes.data ?? [],
    banks: banksRes.data ?? [],
  });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const client = db();
  const { error } = await client.from("materials").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
