import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { makeFetch } from "@/lib/ai";
import { presignUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Params {
  params: Promise<{ id: string }>;
}

// POST /api/materials/:id/parse 解析材料文件为文本
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const client = db();

  const { data: material, error: mErr } = await client
    .from("materials")
    .select("id, file_key, file_type, content_text, status")
    .eq("id", id)
    .maybeSingle();
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
  if (!material) return NextResponse.json({ error: "材料不存在" }, { status: 404 });

  // 已有内容则直接返回
  if (material.content_text && material.content_text.length > 20) {
    return NextResponse.json({
      material_id: id,
      text: material.content_text,
      cached: true,
    });
  }

  await client
    .from("materials")
    .update({ status: "parsing", error_message: null })
    .eq("id", id);

  try {
    const fileUrl = await presignUrl(material.file_key, 3600);
    const fetchClient = makeFetch(req.headers);
    const resp = await fetchClient.fetch(fileUrl);
    if (resp.status_code && resp.status_code !== 0) {
      throw new Error(resp.status_message || "文件解析失败");
    }
    const text = (resp.content || [])
      .filter((item) => item.type === "text" && item.text)
      .map((item) => item.text as string)
      .join("\n")
      .trim();

    if (!text) throw new Error("文件解析后内容为空");

    await client
      .from("materials")
      .update({
        content_text: text,
        status: "parsed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({ material_id: id, text, cached: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await client
      .from("materials")
      .update({ status: "failed", error_message: msg })
      .eq("id", id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
