import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/operation-logs 操作日志列表
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "无权限，仅管理员可查看" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20")));
  const userId = searchParams.get("user_id");
  const action = searchParams.get("action");
  const targetType = searchParams.get("target_type");
  const startDate = searchParams.get("start_date");
  const endDate = searchParams.get("end_date");

  const client = db();
  let query = client
    .from("operation_logs")
    .select("id, user_id, user_name, action, target_type, target_id, detail, ip_address, created_at", { count: "exact" })
    .order("created_at", { ascending: false });

  // 筛选条件
  if (userId) {
    query = query.eq("user_id", userId);
  }
  if (action) {
    query = query.eq("action", action);
  }
  if (targetType) {
    query = query.eq("target_type", targetType);
  }
  if (startDate) {
    query = query.gte("created_at", startDate);
  }
  if (endDate) {
    query = query.lte("created_at", endDate);
  }

  // 分页
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    items: data ?? [],
    total: count ?? 0,
    page,
    pageSize,
  });
}
