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
  
  // 先检查是否有"解析中"状态超期的材料（超过4分钟还在parsing，说明进程可能被杀）
  const fourMinutesAgo = new Date(Date.now() - 4 * 60 * 1000).toISOString();
  await client
    .from("materials")
    .update({ 
      status: "failed", 
      error_message: "解析超时，进程可能异常终止。请重新触发解析",
      updated_at: new Date().toISOString()
    })
    .eq("status", "parsing")
    .lt("updated_at", fourMinutesAgo);
  
  let query = client
    .from("materials")
    .select("id, title, file_name, file_type, file_size, status, error_message, owner_id, created_at, updated_at")
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
    
    // 读取文件内容
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.log(`[Upload] 文件: ${file.name}, 大小: ${buffer.byteLength} bytes, 类型: ${file.type}`);

    const safeName = sanitizeFileName(file.name);
    const storage = getStorage();
    const fileName = `materials/${Date.now()}_${safeName}`;
    
    // 带重试的上传（最多3次）
    let key: string | null = null;
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[Upload] 尝试上传 (第${attempt}次): ${fileName}`);
        key = await storage.uploadFile({
          fileContent: buffer,
          fileName,
          contentType: file.type || "application/octet-stream",
        });
        console.log(`[Upload] 上传成功: ${key}`);
        break;
      } catch (uploadErr) {
        lastError = uploadErr instanceof Error ? uploadErr : new Error(String(uploadErr));
        console.warn(`[Upload] 第${attempt}次上传失败: ${lastError.message}`);
        if (attempt < 3) {
          // 等待后重试（指数退避）
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
    
    if (!key) {
      console.error(`[Upload] 上传最终失败: ${lastError?.message}`);
      return NextResponse.json(
        { error: `文件上传失败: ${lastError?.message || "未知错误"}，请重试` },
        { status: 500 }
      );
    }

    // 验证文件是否成功上传到存储（阻塞式，确保文件存在）
    try {
      const verifyUrl = await storage.generatePresignedUrl({ key, expireTime: 60 });
      const headResp = await fetch(verifyUrl, { method: "HEAD" });
      if (!headResp.ok) {
        console.error(`[Upload] 文件验证失败: 存储返回 ${headResp.status}, key=${key}`);
        // 删除已上传的文件
        try { await storage.deleteFile({ fileKey: key }); } catch {}
        return NextResponse.json(
          { error: `文件上传验证失败: 存储返回 ${headResp.status}，请重试` },
          { status: 500 }
        );
      }
      console.log(`[Upload] 文件验证成功: ${key}`);
    } catch (verifyErr) {
      const errMsg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
      console.error(`[Upload] 文件验证异常: ${errMsg}`);
      // 验证异常不阻塞，但记录警告
      console.warn(`[Upload] 验证跳过: ${errMsg}`);
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

    if (error) {
      console.error(`[Upload] 数据库写入失败: ${error.message}`);
      // 数据库写入失败，删除已上传的文件
      try { await storage.deleteFile({ fileKey: key }); } catch {}
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    console.log(`[Upload] 材料创建成功: id=${data.id}, key=${key}`);
    return NextResponse.json({ material: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Upload] 异常: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
