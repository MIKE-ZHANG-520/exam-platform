"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiGet, fmtDuration } from "@/lib/http";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, ArrowRight } from "lucide-react";

interface Response {
  record: {
    id: string;
    candidate_name: string;
    team: string | null;
    score: number | null;
    is_pass: boolean | null;
    attempt_no: number;
    duration_sec: number | null;
    status: string;
  };
  exam: { title: string; pass_score: number } | null;
}

function ResultInner() {
  const params = useParams<{ id: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const rid = sp.get("rid") || "";
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!rid) {
      router.replace(`/exam/${params.id}`);
      return;
    }
    apiGet<Response>(`/api/records/${rid}`)
      .then(setData)
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [rid, params.id, router]);

  if (loading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#1E5AA8]" />
      </div>
    );
  }

  const r = data.record;
  const passed = !!r.is_pass;

  return (
    <div className="mx-auto max-w-md px-4 pb-10 pt-6">
      <Card className={`border-none ${passed ? "bg-[#DCFCE7]" : "bg-[#FEE2E2]"}`}>
        <CardContent className="flex flex-col items-center py-8 text-center">
          {passed ? (
            <CheckCircle2 className="h-16 w-16 text-[#12A150]" />
          ) : (
            <XCircle className="h-16 w-16 text-[#DC2626]" />
          )}
          <p className={`mt-3 text-xl font-semibold ${passed ? "text-[#166534]" : "text-[#DC2626]"}`}>
            {passed ? "恭喜通过考试" : "很遗憾，未通过"}
          </p>
          <div className="mt-4">
            <span className={`text-5xl font-bold tabular-nums ${passed ? "text-[#12A150]" : "text-[#DC2626]"}`}>
              {r.score ?? 0}
            </span>
            <span className="ml-1 text-sm text-[#667085]">/ 100</span>
          </div>
          <p className="mt-1 text-xs text-[#667085]">及格线 {data.exam?.pass_score ?? 80} 分</p>
        </CardContent>
      </Card>

      <Card className="mt-4 border-[#E4E7EC]">
        <CardContent className="grid grid-cols-2 gap-3 p-4 text-sm">
          <Row label="姓名" value={r.candidate_name} />
          <Row label="班组" value={r.team || "-"} />
          <Row label="试卷" value={data.exam?.title || ""} />
          <Row label="第几次" value={`第 ${r.attempt_no} 次`} />
          <Row label="用时" value={fmtDuration(r.duration_sec)} />
          <Row label="交卷方式" value={r.status === "auto_submitted" ? "自动交卷" : "手动提交"} />
        </CardContent>
      </Card>

      {!passed && r.attempt_no >= 2 && (
        <div className="mt-3 rounded-md border border-[#F2C878] bg-[#FFFBEA] p-3 text-xs text-[#8A6A2E]">
          您已用完 2 次考试机会，请联系管理员安排补训后重新参考。
        </div>
      )}

      <div className="mt-6 space-y-2">
        <Button
          onClick={() => router.replace(`/exam/${params.id}/evaluate?rid=${r.id}`)}
          className="h-12 w-full bg-[#1E5AA8] text-base hover:bg-[#154275]"
        >
          填写讲师评价 <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-[#667085]">{label}</p>
      <p className="mt-0.5 font-medium text-[#1F2937]">{value}</p>
    </div>
  );
}

export default function ResultPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-[#667085]">加载中...</div>}>
      <ResultInner />
    </Suspense>
  );
}
