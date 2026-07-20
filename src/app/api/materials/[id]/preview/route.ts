import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { presignUrl } from "@/lib/storage"
import { requireSession } from "@/lib/auth"

export const runtime = "nodejs"

interface Params {
  params: Promise<{ id: string }>
}

/**
 * GET /api/materials/:id/preview
 * 返回文件预签名 URL，前端据此渲染预览
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const sess = await requireSession()
    if (!sess) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })

    const { id } = await params
    const client = db()
    const { data: material, error } = await client
      .from("materials")
      .select("id, file_name, file_type, file_key, file_size")
      .eq("id", id)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!material) return NextResponse.json({ error: "材料不存在" }, { status: 404 })
    if (!material.file_key) return NextResponse.json({ error: "文件存储路径缺失" }, { status: 400 })

    const fileUrl = await presignUrl(material.file_key, 3600)

    return NextResponse.json({
      fileUrl,
      fileName: material.file_name,
      fileType: material.file_type?.toLowerCase(),
      fileSize: material.file_size,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[preview] GET error:", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
