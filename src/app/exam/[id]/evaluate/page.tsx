"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiPost } from "@/lib/http";
import { toast } from "sonner";
import { Star, CheckCircle2, Loader2 } from "lucide-react";

const DIMS = [
  { key: "score_content", label: "内容实用性", desc: "培训内容是否对实际工作有帮助" },
  { key: "score_clarity", label: "讲解清晰度", desc: "讲师表达是否清晰易懂" },
  { key: "score_interaction", label: "互动参与感", desc: "是否鼓励提问和互动" },
  { key: "score_time", label: "时间合理性", desc: "培训时长安排是否合理" },
  { key: "score_overall", label: "整体满意度", desc: "对本次培训的整体评价" },
] as const;

type DimKey = (typeof DIMS)[number]["key"];

function EvalInner() {
  const params = useParams<{ id: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const rid = sp.get("rid") || "";

  const [scores, setScores] = useState<Record<DimKey, number>>({
    score_content: 0,
    score_clarity: 0,
    score_interaction: 0,
    score_time: 0,
    score_overall: 0,
  });
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const canSubmit = Object.values(scores).every((v) => v > 0);

  const onSubmit = async () => {
    if (!canSubmit) {
      toast.error("请为每个维度打分");
      return;
    }
    setSubmitting(true);
    try {
      await apiPost(`/api/records/${rid}/evaluate`, { ...scores, comment });
      setDone(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4">
        <CheckCircle2 className="h-16 w-16 text-[#12A150]" />
        <p className="mt-3 text-xl font-semibold text-[#166534]">感谢您的评价</p>
        <p className="mt-1 text-sm text-[#667085]">您的反馈将帮助我们改进培训</p>
        <Button
          onClick={() => router.replace(`/exam/${params.id}`)}
          variant="outline"
          className="mt-6"
        >
          返回首页
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 pb-10 pt-6">
      <h1 className="text-xl font-semibold text-[#1F2937]">讲师评价</h1>
      <p className="mt-1 mb-4 text-xs text-[#667085]">您的评价是对讲师最好的反馈</p>

      <div className="space-y-3">
        {DIMS.map((dim) => (
          <Card key={dim.key} className="border-[#E4E7EC]">
            <CardContent className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[#1F2937]">{dim.label}</p>
                  <p className="text-xs text-[#667085]">{dim.desc}</p>
                </div>
                <span className="text-xs tabular-nums text-[#667085]">
                  {scores[dim.key] > 0 ? `${scores[dim.key]} 星` : "未评"}
                </span>
              </div>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => {
                  const active = n <= scores[dim.key];
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setScores({ ...scores, [dim.key]: n })}
                      className="rounded-full p-1 transition-transform active:scale-90"
                    >
                      <Star
                        className={`h-7 w-7 ${active ? "fill-[#F26E22] text-[#F26E22]" : "text-[#CBD5E1]"}`}
                      />
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-4">
        <p className="mb-1.5 text-sm font-medium text-[#1F2937]">建议与意见（可选）</p>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="您对本次培训有什么建议？"
          rows={4}
          maxLength={500}
        />
      </div>

      <Button
        onClick={onSubmit}
        disabled={submitting || !canSubmit}
        className="mt-6 h-12 w-full bg-[#1E5AA8] text-base hover:bg-[#154275]"
      >
        {submitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
        提交评价
      </Button>
    </div>
  );
}

export default function EvaluatePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-[#667085]">加载中...</div>}>
      <EvalInner />
    </Suspense>
  );
}
