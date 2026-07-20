"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet, fmtDate, fmtDuration } from "@/lib/http";
import { toast } from "sonner";
import { Loader2, Eye, Download, Search, FileText, ChevronDown, ChevronRight, LayoutList, Layers } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";

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
  const [viewMode, setViewMode] = useState<"flat" | "grouped">("flat");
  const [expandedExams, setExpandedExams] = useState<Set<string>>(new Set());

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

  // 按试卷分组
  const groupedData = useCallback(() => {
    const groups = new Map<string, { exam: { id: string; title: string }; records: Record[] }>();
    
    // 初始化所有有记录的试卷分组
    for (const record of items) {
      const examId = record.exam_id;
      if (!groups.has(examId)) {
        const examInfo = exams.find(e => e.id === examId);
        groups.set(examId, {
          exam: { id: examId, title: examInfo?.title || record.exam_title || "未知试卷" },
          records: [],
        });
      }
      groups.get(examId)!.records.push(record);
    }
    
    // 计算统计信息
    return Array.from(groups.values()).map(group => {
      const records = group.records;
      const scoredRecords = records.filter(r => r.score !== null);
      const passedRecords = records.filter(r => r.is_pass === true);
      const avgScore = scoredRecords.length > 0
        ? Math.round(scoredRecords.reduce((sum, r) => sum + (r.score || 0), 0) / scoredRecords.length)
        : null;
      const passRate = records.length > 0
        ? Math.round((passedRecords.length / records.length) * 100)
        : null;
      
      return {
        ...group,
        stats: {
          total: records.length,
          avgScore,
          passRate,
          passed: passedRecords.length,
        },
      };
    }).sort((a, b) => b.stats.total - a.stats.total);
  }, [items, exams]);

  // 切换分组展开状态
  const toggleExam = (examId: string) => {
    setExpandedExams(prev => {
      const next = new Set(prev);
      if (next.has(examId)) {
        next.delete(examId);
      } else {
        next.add(examId);
      }
      return next;
    });
  };

  // 展开/折叠全部
  const expandAll = () => {
    const grouped = groupedData();
    setExpandedExams(new Set(grouped.map(g => g.exam.id)));
  };

  const collapseAll = () => {
    setExpandedExams(new Set());
  };

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
    <div className="space-y-6">
      <PageHeader
        title="考试记录"
        subtitle="工人考试的所有详细记录，可搜索导出"
        icon={<FileText className="h-5 w-5" />}
        right={
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-gray-200 p-0.5 bg-gray-50">
              <button
                onClick={() => setViewMode("flat")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all ${
                  viewMode === "flat"
                    ? "bg-white text-[#1677ff] shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <LayoutList className="w-4 h-4" />
                列表
              </button>
              <button
                onClick={() => setViewMode("grouped")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all ${
                  viewMode === "grouped"
                    ? "bg-white text-[#1677ff] shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Layers className="w-4 h-4" />
                按试卷分组
              </button>
            </div>
            <Button variant="outline" onClick={exportCsv} disabled={items.length === 0} className="hover:border-[#1677ff] hover:text-[#1677ff]">
              <Download className="mr-1 h-4 w-4" /> 导出 CSV
            </Button>
          </div>
        }
      />

      <div className="brand-card rounded-xl p-4">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
          <Search className="w-4 h-4" /> 筛选条件
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="mb-1 block text-xs text-gray-500">姓名</Label>
            <Input value={filter.name} onChange={(e) => setFilter({ ...filter, name: e.target.value })} placeholder="姓名关键字" />
          </div>
          <div>
            <Label className="mb-1 block text-xs text-gray-500">班组</Label>
            <Input value={filter.team} onChange={(e) => setFilter({ ...filter, team: e.target.value })} placeholder="精确匹配" />
          </div>
          <div>
            <Label className="mb-1 block text-xs text-gray-500">试卷</Label>
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
            <Label className="mb-1 block text-xs text-gray-500">结果</Label>
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
        </div>
      </div>

      {viewMode === "flat" ? (
        <Card className="brand-card border-0">
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="skeleton h-10 rounded" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="py-16 flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center mb-3">
                  <Eye className="w-7 h-7 text-[#1677ff]" />
                </div>
                <p className="text-[15px] font-medium text-gray-800">暂无考试记录</p>
                <p className="text-xs text-gray-400 mt-1">工人完成考试后记录会在这里展示</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/60">
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
                  {items.map((r, i) => (
                    <TableRow key={r.id} className={i % 2 === 1 ? "bg-gray-50/30" : ""}>
                      <TableCell className="font-medium text-gray-900">{r.candidate_name}</TableCell>
                      <TableCell className="text-gray-600">{r.team || "-"}</TableCell>
                      <TableCell className="text-gray-600">{r.exam_title || "-"}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold text-gray-900">{r.score ?? "-"}</TableCell>
                      <TableCell>
                        {r.is_pass === null ? (
                          <Badge className="bg-orange-50 text-orange-700 border border-orange-200">未完成</Badge>
                        ) : r.is_pass ? (
                          <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200">通过</Badge>
                        ) : (
                          <Badge className="bg-red-50 text-red-700 border border-red-200">未通过</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-gray-600">第 {r.attempt_no} 次</TableCell>
                      <TableCell className="text-gray-600">{fmtDuration(r.duration_sec)}</TableCell>
                      <TableCell className="text-gray-500">{fmtDate(r.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <Link href={`/admin/records/${r.id}`}>
                          <Button variant="ghost" size="sm" className="hover:text-[#1677ff]">
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
      ) : (
        /* 按试卷分组视图 */
        <div className="space-y-4">
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="brand-card rounded-xl p-4 space-y-3">
                  <div className="skeleton h-12 rounded-lg" />
                  <div className="skeleton h-10 rounded" />
                  <div className="skeleton h-10 rounded" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <Card className="brand-card border-0">
              <CardContent className="py-16 flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center mb-3">
                  <Eye className="w-7 h-7 text-[#1677ff]" />
                </div>
                <p className="text-[15px] font-medium text-gray-800">暂无考试记录</p>
                <p className="text-xs text-gray-400 mt-1">工人完成考试后记录会在这里展示</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* 展开/折叠全部按钮 */}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={expandAll} className="text-gray-500 hover:text-[#1677ff]">
                  <ChevronDown className="w-4 h-4 mr-1" /> 全部展开
                </Button>
                <Button variant="ghost" size="sm" onClick={collapseAll} className="text-gray-500 hover:text-[#1677ff]">
                  <ChevronRight className="w-4 h-4 mr-1" /> 全部折叠
                </Button>
              </div>
              
              {/* 分组列表 */}
              {groupedData().map((group) => {
                const isExpanded = expandedExams.has(group.exam.id);
                return (
                  <div key={group.exam.id} className="brand-card rounded-xl overflow-hidden">
                    {/* 分组标题栏 */}
                    <button
                      onClick={() => toggleExam(group.exam.id)}
                      className="w-full flex items-center justify-between p-4 hover:bg-gray-50/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-transform ${
                          isExpanded ? "bg-[#1677ff]/10 text-[#1677ff]" : "bg-gray-100 text-gray-500"
                        }`}>
                          {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                        </div>
                        <div className="text-left">
                          <h3 className="font-semibold text-gray-900">{group.exam.title}</h3>
                          <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                            <span>共 <span className="font-medium text-gray-700">{group.stats.total}</span> 次考试</span>
                            {group.stats.avgScore !== null && (
                              <span>平均分 <span className="font-medium text-gray-700">{group.stats.avgScore}</span></span>
                            )}
                            {group.stats.passRate !== null && (
                              <span>
                                通过率{" "}
                                <span className={`font-medium ${
                                  group.stats.passRate >= 80 ? "text-emerald-600" : 
                                  group.stats.passRate >= 60 ? "text-amber-600" : "text-red-600"
                                }`}>
                                  {group.stats.passRate}%
                                </span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-blue-50 text-blue-700 border border-blue-200">
                          {group.stats.passed}/{group.stats.total} 通过
                        </Badge>
                      </div>
                    </button>
                    
                    {/* 展开的表格 */}
                    {isExpanded && (
                      <div className="border-t border-gray-100">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-gray-50/60">
                              <TableHead>姓名</TableHead>
                              <TableHead>班组</TableHead>
                              <TableHead className="text-right">得分</TableHead>
                              <TableHead>结果</TableHead>
                              <TableHead>次数</TableHead>
                              <TableHead>用时</TableHead>
                              <TableHead>考试时间</TableHead>
                              <TableHead className="text-right">操作</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.records.map((r, i) => (
                              <TableRow key={r.id} className={i % 2 === 1 ? "bg-gray-50/30" : ""}>
                                <TableCell className="font-medium text-gray-900">{r.candidate_name}</TableCell>
                                <TableCell className="text-gray-600">{r.team || "-"}</TableCell>
                                <TableCell className="text-right tabular-nums font-semibold text-gray-900">{r.score ?? "-"}</TableCell>
                                <TableCell>
                                  {r.is_pass === null ? (
                                    <Badge className="bg-orange-50 text-orange-700 border border-orange-200">未完成</Badge>
                                  ) : r.is_pass ? (
                                    <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200">通过</Badge>
                                  ) : (
                                    <Badge className="bg-red-50 text-red-700 border border-red-200">未通过</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-gray-600">第 {r.attempt_no} 次</TableCell>
                                <TableCell className="text-gray-600">{fmtDuration(r.duration_sec)}</TableCell>
                                <TableCell className="text-gray-500">{fmtDate(r.created_at)}</TableCell>
                                <TableCell className="text-right">
                                  <Link href={`/admin/records/${r.id}`}>
                                    <Button variant="ghost" size="sm" className="hover:text-[#1677ff]">
                                      <Eye className="mr-1 h-4 w-4" /> 详情
                                    </Button>
                                  </Link>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function RecordsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-gray-500"><Loader2 className="inline mr-2 h-4 w-4 animate-spin" />加载中...</div>}>
      <RecordsInner />
    </Suspense>
  );
}
