import { NextRequest, NextResponse } from "next/server"
import { getSupabaseClient } from "@/storage/database/supabase-client"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const client = getSupabaseClient()
  const formData = await req.formData()
  const file = formData.get("file") as File
  const projectId = formData.get("project_id") as string

  if (!file || !projectId) {
    return NextResponse.json({ error: "缺少文件或项目 ID" }, { status: 400 })
  }

  // 读取文件内容（简单 CSV 解析）
  const text = await file.text()
  const lines = text.split("\n").filter((l) => l.trim())
  const headers = lines[0].split(",").map((h) => h.trim())

  const teams = []
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim())
    if (values.length < 2) continue

    const team: any = {
      id: crypto.randomUUID(),
      project_id: projectId,
      name: values[0] || "",
      main_work_type: values[1] || "",
      leader: values[2] || "",
      leader_phone: values[3] || "",
      status: "active",
    }
    teams.push(team)
  }

  if (teams.length === 0) {
    return NextResponse.json({ error: "未解析到有效数据" }, { status: 400 })
  }

  // 批量插入
  const { data, error } = await client.from("teams").insert(teams).select()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ created: data?.length || 0, teams: data })
}
