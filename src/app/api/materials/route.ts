import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

const ALLOWED_TYPES: Record<string, string> = {
  ".docx": "docx",
  ".xlsx": "xlsx",
  ".pdf": "pdf",
  ".pptx": "pptx",
  ".md": "md",
};

function sanitizeFileName(name: string): string {
  // 只保留字母数字点下划线短横线，其它替换为 _
  return name.replace(/[^A-Za-z0-9._-]/g, "_");
}

// GET /api/materials 列表
export async function GET() {
  const client = db();
  const { data, error } = await client
    .from("materials")
    .select("id, title, file_name, file_type, file_size, status, error_message, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

// POST /api/materials 上传
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const title = ((formData.get("title") as string | null) || "").trim();

    if (!file) return NextResponse.json({ error: "缺少文件" }, { status: 400 });

    const lowerName = file.name.toLowerCase();
    const ext = Object.keys(ALLOWED_TYPES).find((e) => lowerName.endsWith(e));
    if (!ext) {
      return NextResponse.json(
        { error: "仅支持 .docx / .xlsx / .pdf / .pptx / .md" },
        { status: 400 },
      );
    }
    const fileType = ALLOWED_TYPES[ext];
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const safeName = sanitizeFileName(file.name);
    const storage = getStorage();
    const key = await storage.uploadFile({
      fileContent: buffer,
      fileName: `materials/${Date.now()}_${safeName}`,
      contentType: file.type || "application/octet-stream",
    });

    const client = db();
    const { data, error } = await client
      .from("materials")
      .insert({
        title: title || file.name,
        file_name: file.name,
        file_type: fileType,
        file_key: key,
        file_size: buffer.byteLength,
        status: "uploaded",
      })
      .select("id, title, file_name, file_type, file_size, status, created_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ material: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
