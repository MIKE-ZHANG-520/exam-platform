import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// 将超过 12 小时未提交的考试记录标记为未通过
export async function POST() {
  try {
    const client = await db();
    // 查找超过 12 小时的 ongoing 记录
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    const { data: expiredRecords, error: fetchError } = await client
      .from("exam_records")
      .select("id, exam_id")
      .eq("status", "ongoing")
      .lt("created_at", twelveHoursAgo);

    if (fetchError) {
      console.error("查询超时记录失败:", fetchError);
      return NextResponse.json({ error: "查询超时记录失败" }, { status: 500 });
    }

    if (!expiredRecords || expiredRecords.length === 0) {
      return NextResponse.json({ updated: 0, message: "没有超时记录" });
    }

    // 批量更新为未通过
    const ids = expiredRecords.map((r) => r.id);
    const { error: updateError } = await client
      .from("exam_records")
      .update({
        status: "auto_submitted",
        is_pass: false,
        score: 0,
        updated_at: new Date().toISOString(),
      })
      .in("id", ids);

    if (updateError) {
      console.error("更新超时记录失败:", updateError);
      return NextResponse.json({ error: "更新超时记录失败" }, { status: 500 });
    }

    console.log(`已处理 ${ids.length} 条超时记录`);
    return NextResponse.json({ updated: ids.length, ids });
  } catch (error) {
    console.error("处理超时记录异常:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

// GET 用于查询超时记录数量（不执行更新）
export async function GET() {
  try {
    const client = await db();
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    const { count, error } = await client
      .from("exam_records")
      .select("*", { count: "exact", head: true })
      .eq("status", "ongoing")
      .lt("created_at", twelveHoursAgo);

    if (error) {
      return NextResponse.json({ error: "查询失败" }, { status: 500 });
    }

    return NextResponse.json({ expired_count: count || 0 });
  } catch (error) {
    console.error("查询超时记录异常:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
