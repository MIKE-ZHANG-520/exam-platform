"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet, fmtDate, fmtDuration } from "@/lib/http";
import { toast } from "sonner";
import { Loader2, Eye } from "lucide-react";

interface Record {
  id: string;
  exam_id: string;
  exam_title: string | null;
  paper_type: string | null;
  candidate_name: string;
  phone: string | null;
  team: string | null;
  score: number | null;
  is_pass: boolean | null;
  status: string;
  attempt_no: number;
  duration_sec: number | null;
  created_at: string;
}

function RecordsInner() {
  const sp = useSearchParams();
  const initialExam = sp.get("exam_id") || "";
  const [items, setItems] = useState<Record[]>([]);
  const [exams, setExams] = useState<Array<{ id: string; title: string }>>([]);
  const [loading, setLoading] = useState(true);

  const [filter, setFilter] = useState<{ name: string; team: string; exam_id: string; is_pass: "all" | "true" | "false" }>({
    name: "",
    team: "",
    exam_id: initialExam,
    is_pass: "all",
  });

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (filter.name) qs.set("name", filter.name);
    if (filter.team) qs.set("team", filter.team);
    if (filter.exam_id) qs.set("exam_id", filter.exam_id);
    if (filter.is_pass !== "all") qs.set("is_pass", filter.is_pass);
    apiGet<{ items: Record[] }>(`/api/records?${qs.toString()}`)
      .then((r) => setItems(r.items))
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    apiGet<{ items: Array<{ id: string; title: string }> }>("/api/exams")
      .then((r) => setExams(r.items))
      .catch(() => {});
  }, []);

  const exportCsv = () => {
    const rows: string[] = [
      ["姓名", "班组", "手机号", "试卷", "得分", "是否通过", "次数", "用时", "考试时间"].join(","),
      ...items.map((r) =>
        [
          r.candidate_name,
          r.team || "",
          r.phone || "",
          r.exam_title || "",
          r.score ?? 0,
          r.is_pass ? "通过" : r.is_pass === false ? "未通过" : "未完成",
          r.attempt_no,
          fmtDuration(r.duration_sec),
          fmtDate(r.created_at),
        ]
          .map((s) => `"${String(s).replace(/"/g, '""')}"`)
          .join(",")
      ),
    ];
    const csv = "\ufeff" + rows.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `records-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title="考试记录"
        description="所有工人考试的详细记录"
        right={
          <Button variant="outline" onClick={exportCsv} disabled={items.length === 0}>
            导出 CSV
          </Button>
        }
      />

      <Card className="mb-4 border-[#E4E7EC]">
        <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="mb-1 block text-xs">姓名</Label>
            <Input value={filter.name} onChange={(e) => setFilter({ ...filter, name: e.target.value })} placeholder="姓名关键字" />
          </div>
          <div>
            <Label className="mb-1 block text-xs">班组</Label>
            <Input value={filter.team} onChange={(e) => setFilter({ ...filter, team: e.target.value })} placeholder="精确匹配" />
          </div>
          <div>
            <Label className="mb-1 block text-xs">试卷</Label>
            <Select value={filter.exam_id || "__all__"} onValueChange={(v) => setFilter({ ...filter, exam_id: v === "__all__" ? "" : v })}>
              <SelectTrigger>
                <SelectValue placeholder="全部试卷" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">全部试卷</SelectItem>
                {exams.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-xs">结果</Label>
            <Select value={filter.is_pass} onValueChange={(v) => setFilter({ ...filter, is_pass: v as typeof filter.is_pass })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="true">已通过</SelectItem>
                <SelectItem value="false">未通过</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="border-[#E4E7EC]">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-sm text-[#667085]">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载中...
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center text-sm text-[#667085]">暂无考试记录</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>姓名</TableHead>
                  <TableHead>班组</TableHead>
                  <TableHead>试卷</TableHead>
                  <TableHead className="text-right">得分</TableHead>
                  <TableHead>结果</TableHead>
                  <TableHead>次数</TableHead>
                  <TableHead>用时</TableHead>
                  <TableHead>考试时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.candidate_name}</TableCell>
                    <TableCell>{r.team || "-"}</TableCell>
                    <TableCell>{r.exam_title || "-"}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{r.score ?? "-"}</TableCell>
                    <TableCell>
                      {r.is_pass === null ? (
                        <Badge className="bg-[#FEF3C7] text-[#B45309]">未完成</Badge>
                      ) : r.is_pass ? (
                        <Badge className="bg-[#DCFCE7] text-[#166534]">通过</Badge>
                      ) : (
                        <Badge className="bg-[#FEE2E2] text-[#DC2626]">未通过</Badge>
                      )}
                    </TableCell>
                    <TableCell>第 {r.attempt_no} 次</TableCell>
                    <TableCell>{fmtDuration(r.duration_sec)}</TableCell>
                    <TableCell>{fmtDate(r.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Link href={`/admin/records/${r.id}`}>
                        <Button variant="ghost" size="sm">
                          <Eye className="mr-1 h-4 w-4" /> 详情
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default function RecordsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-[#667085]">加载中...</div>}>
      <RecordsInner />
    </Suspense>
  );
}
