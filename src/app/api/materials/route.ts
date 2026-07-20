import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { getSession } from "@/lib/auth";

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

function deriveTitleFromFileName(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  return lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
}

// GET /api/materials 列表
export async function GET() {
  const session = await getSession();
  const client = db();
  let query = client
    .from("materials")
    .select("id, title, file_name, file_type, file_size, status, error_message, owner_id, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  // 普通用户只能看自己创建的材料
  if (session && session.role === "user") {
    query = query.eq("owner_id", session.id);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

// POST /api/materials 上传
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
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

    // 验证文件是否成功上传到存储
    try {
      const presignedUrl = await storage.generatePresignedUrl({ key, expireTime: 60 });
      const headResp = await fetch(presignedUrl, { method: "HEAD" });
      if (!headResp.ok) {
        throw new Error(`文件上传验证失败：存储返回 ${headResp.status}，请重试`);
      }
    } catch (verifyErr) {
      const msg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
      throw new Error(`文件存储验证失败：${msg}`);
    }

    // 标题优先用用户填的，否则用文件名去掉扩展名
    const finalTitle = title || deriveTitleFromFileName(file.name);

    const client = db();
    const { data, error } = await client
      .from("materials")
      .insert({
        title: finalTitle,
        file_name: file.name,
        file_type: fileType,
        file_key: key,
        file_size: buffer.byteLength,
        status: "uploaded",
        owner_id: session?.id ?? null,
      })
      .select("id, title, file_name, file_type, file_size, status, owner_id, created_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ material: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
