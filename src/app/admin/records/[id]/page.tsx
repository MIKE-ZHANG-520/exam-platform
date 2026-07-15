"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiGet, fmtDate, fmtDuration } from "@/lib/http";
import { toast } from "sonner";
import { ArrowLeft, Loader2, CheckCircle2, XCircle } from "lucide-react";

interface QuestionOption {
  key: string;
  text: string;
}

interface PaperItem {
  question_id: string;
  type: "single" | "multiple" | "judge";
  content: string;
  options: QuestionOption[];
  answer: string[];
  explanation?: string | null;
}

interface RecordData {
  id: string;
  exam_id: string;
  candidate_name: string;
  phone: string | null;
  team: string | null;
  id_card_mask: string | null;
  score: number | null;
  is_pass: boolean | null;
  attempt_no: number;
  status: string;
  switch_count: number;
  duration_sec: number | null;
  paper_snapshot: { items: PaperItem[] };
  answers: Record<string, string[]> | null;
  created_at: string;
}

interface Response {
  record: RecordData;
  exam: { title: string; pass_score: number; paper_type: string } | null;
}

const TYPE_LABEL: Record<string, string> = { single: "单选", multiple: "多选", judge: "判断" };

export default function RecordDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiGet<Response>(`/api/records/${id}`)
      .then(setData)
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-[#667085]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载中...
      </div>
    );
  }
  if (!data) return null;
  const r = data.record;
  const answers = r.answers || {};

  return (
    <>
      <div className="mb-4">
        <Link href="/admin/records" className="inline-flex items-center text-sm text-[#667085] hover:text-[#1E5AA8]">
          <ArrowLeft className="mr-1 h-3.5 w-3.5" /> 返回考试记录
        </Link>
      </div>
      <PageHeader title={`${r.candidate_name} 的答卷`} description={data.exam?.title || ""} />

      <Card className="mb-4 border-[#E4E7EC]">
        <CardContent className="grid grid-cols-2 gap-4 p-4 md:grid-cols-4">
          <Info label="姓名" value={r.candidate_name} />
          <Info label="班组" value={r.team || "-"} />
          <Info label="手机号" value={r.phone || "-"} />
          <Info label="身份证号" value={r.id_card_mask || "-"} />
          <div>
            <p className="text-xs text-[#667085]">得分</p>
            <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: r.is_pass ? "#12A150" : "#DC2626" }}>
              {r.score ?? "-"}
              <span className="ml-1 text-sm font-normal text-[#667085]">/ 100</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-[#667085]">结果</p>
            <Badge className={`mt-1 ${r.is_pass ? "bg-[#DCFCE7] text-[#166534]" : "bg-[#FEE2E2] text-[#DC2626]"}`}>
              {r.is_pass ? "通过" : r.is_pass === false ? "未通过" : "未完成"}
            </Badge>
          </div>
          <Info label="用时" value={fmtDuration(r.duration_sec)} />
          <Info label="考试时间" value={fmtDate(r.created_at)} />
          <Info label="第几次考试" value={`第 ${r.attempt_no} 次`} />
          <Info label="切屏次数" value={String(r.switch_count)} />
          <Info label="交卷方式" value={r.status === "auto_submitted" ? "自动交卷（超时/切屏）" : r.status === "submitted" ? "手动提交" : "未完成"} />
        </CardContent>
      </Card>

      <div className="space-y-3">
        {r.paper_snapshot.items.map((it, idx) => {
          const user = (answers[it.question_id] || []).slice().sort();
          const correct = it.answer.slice().sort();
          const isCorrect = user.length === correct.length && user.every((v, i) => v === correct[i]);
          return (
            <Card key={it.question_id} className="border-[#E4E7EC]">
              <CardContent className="p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-[#667085]">第 {idx + 1} 题</span>
                  <Badge className="bg-[#E0EDFF] text-[#1E5AA8]">{TYPE_LABEL[it.type]}</Badge>
                  {isCorrect ? (
                    <Badge className="bg-[#DCFCE7] text-[#166534]"><CheckCircle2 className="mr-1 h-3 w-3" /> 正确</Badge>
                  ) : (
                    <Badge className="bg-[#FEE2E2] text-[#DC2626]"><XCircle className="mr-1 h-3 w-3" /> 错误</Badge>
                  )}
                </div>
                <p className="mb-2 text-sm text-[#1F2937]">{it.content}</p>
                <div className="mb-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {it.options.map((opt) => {
                    const isRightOpt = it.answer.includes(opt.key);
                    const isUser = user.includes(opt.key);
                    let cls = "border-[#E4E7EC] text-[#667085]";
                    if (isRightOpt) cls = "border-[#12A150] bg-[#DCFCE7] text-[#166534]";
                    else if (isUser) cls = "border-[#DC2626] bg-[#FEE2E2] text-[#DC2626]";
                    return (
                      <div key={opt.key} className={`rounded-md border px-3 py-1.5 text-xs ${cls}`}>
                        <span className="font-semibold">{opt.key}.</span> {opt.text}
                        {isUser && !isRightOpt && <span className="ml-2 text-[10px]">（你的答案）</span>}
                      </div>
                    );
                  })}
                </div>
                {it.explanation && (
                  <p className="rounded-md bg-[#F2F5FA] px-3 py-2 text-xs text-[#667085]">
                    <span className="font-semibold text-[#1E5AA8]">解析：</span>
                    {it.explanation}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-[#667085]">{label}</p>
      <p className="mt-1 text-sm font-medium text-[#1F2937]">{value}</p>
    </div>
  );
}
