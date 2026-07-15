"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { apiGet, fmtDate } from "@/lib/http";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, ClipboardCheck, TrendingUp, Users, XCircle, Loader2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";

interface DashboardData {
  kpi: {
    total_records: number;
    first_attempts: number;
    passed: number;
    failed: number;
    pass_rate: number;
    avg_score: number;
    pending_retake: number;
  };
  team_stats: Array<{ team: string; participated: number; passed: number; pass_rate: number }>;
  trend: Array<{ date: string; participated: number; passed: number }>;
  score_buckets: Array<{ name: string; count: number }>;
  retake_list: Array<{ id: string; candidate_name: string; phone: string | null; team: string | null; score: number | null; attempt_no: number; created_at: string }>;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiGet<DashboardData>("/api/dashboard")
      .then((d) => setData(d))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-[#667085]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载中...
      </div>
    );
  }
  if (error) return <div className="text-sm text-red-600">加载失败：{error}</div>;
  if (!data) return null;

  const kpiCards = [
    { title: "考试记录总数", value: data.kpi.total_records, icon: Users, color: "#1E5AA8" },
    { title: "参考人数(首次)", value: data.kpi.first_attempts, icon: ClipboardCheck, color: "#1E5AA8" },
    { title: "通过人数", value: data.kpi.passed, icon: CheckCircle2, color: "#12A150" },
    { title: "未通过人数", value: data.kpi.failed, icon: XCircle, color: "#DC2626" },
    { title: "通过率", value: `${data.kpi.pass_rate}%`, icon: TrendingUp, color: "#12A150" },
    { title: "平均分", value: data.kpi.avg_score, icon: TrendingUp, color: "#1E5AA8" },
    { title: "待补考人数", value: data.kpi.pending_retake, icon: AlertCircle, color: "#F26E22" },
  ];

  return (
    <>
      <PageHeader title="数据看板" description="培训考试整体运行状况" />

      {/* KPI 卡片 */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {kpiCards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.title} className="border-[#E4E7EC]">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-xs text-[#667085]">{c.title}</p>
                  <p className="mt-2 text-3xl font-bold tabular-nums" style={{ color: c.color }}>
                    {c.value}
                  </p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-md" style={{ backgroundColor: `${c.color}14` }}>
                  <Icon className="h-5 w-5" style={{ color: c.color }} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 趋势图 + 分数段 */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="border-[#E4E7EC] lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-semibold">近 7 天参考趋势</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.trend} margin={{ top: 4, right: 16, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E4E7EC" />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#667085" }} />
                  <YAxis tick={{ fontSize: 12, fill: "#667085" }} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderColor: "#E4E7EC", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line name="参考" type="monotone" dataKey="participated" stroke="#1E5AA8" strokeWidth={2} dot={{ r: 3 }} />
                  <Line name="通过" type="monotone" dataKey="passed" stroke="#12A150" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#E4E7EC]">
          <CardHeader>
            <CardTitle className="text-base font-semibold">分数段分布</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.score_buckets} margin={{ top: 4, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E4E7EC" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#667085" }} />
                  <YAxis tick={{ fontSize: 12, fill: "#667085" }} allowDecimals={false} />
                  <Tooltip contentStyle={{ borderColor: "#E4E7EC", fontSize: 12 }} />
                  <Bar dataKey="count" fill="#1E5AA8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 班组完成率 + 待补考清单 */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="border-[#E4E7EC]">
          <CardHeader>
            <CardTitle className="text-base font-semibold">班组完成率排行</CardTitle>
          </CardHeader>
          <CardContent>
            {data.team_stats.length === 0 ? (
              <p className="text-sm text-[#667085]">暂无数据</p>
            ) : (
              <div className="space-y-3">
                {data.team_stats.map((t) => (
                  <div key={t.team}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[#1F2937]">{t.team}</span>
                      <span className="tabular-nums text-[#667085]">
                        通过 {t.passed}/{t.participated} · <span className="font-semibold text-[#1F2937]">{t.pass_rate}%</span>
                      </span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[#F2F5FA]">
                      <div
                        className="h-full rounded-full bg-[#1E5AA8] transition-all duration-150"
                        style={{ width: `${Math.min(100, t.pass_rate)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-[#E4E7EC]">
          <CardHeader>
            <CardTitle className="text-base font-semibold">待补考人员</CardTitle>
          </CardHeader>
          <CardContent>
            {data.retake_list.length === 0 ? (
              <p className="text-sm text-[#667085]">目前没有需要补考的人员</p>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {data.retake_list.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-md border border-[#E4E7EC] px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-[#1F2937]">
                        {r.candidate_name}
                        <span className="ml-2 text-xs text-[#667085]">{r.team || "-"}</span>
                      </p>
                      <p className="text-xs text-[#667085]">{fmtDate(r.created_at)} · 第 {r.attempt_no} 次</p>
                    </div>
                    <Badge className="bg-[#FEE2E2] text-[#DC2626] hover:bg-[#FEE2E2]">
                      {r.score} 分
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
