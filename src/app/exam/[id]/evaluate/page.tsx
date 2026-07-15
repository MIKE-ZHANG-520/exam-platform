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
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 bg-gradient-to-b from-emerald-50 via-white to-white">
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle2 className="h-11 w-11 text-emerald-600" />
        </div>
        <p className="mt-4 text-xl font-semibold text-gray-800">感谢你的反馈！</p>
        <p className="mt-1 text-sm text-gray-500">我们会持续改进培训质量</p>
        <Button
          onClick={() => router.replace(`/exam/${params.id}`)}
          className="mt-6 h-11 rounded-lg bg-gradient-to-r from-[#1677ff] to-[#0958d9] hover:brightness-110 px-8"
        >
          返回首页
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#e6f4ff] via-[#f0f7ff] to-white pb-10">
      <div className="bg-gradient-to-br from-[#1677ff] to-[#0958d9] text-white pt-8 pb-10 px-5">
        <div className="mx-auto max-w-md">
          <h1 className="text-2xl font-bold">给培训师打个分</h1>
          <p className="mt-1 text-sm text-white/90">你的评价是对讲师最好的反馈</p>
        </div>
      </div>

      <div className="mx-auto max-w-md px-4 -mt-4 space-y-3">
        {DIMS.map((dim) => (
          <Card key={dim.key} className="border-0 shadow-sm rounded-xl">
            <CardContent className="p-4">
              <div className="mb-2.5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{dim.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{dim.desc}</p>
                </div>
                <span className="text-xs tabular-nums text-gray-400">
                  {scores[dim.key] > 0 ? `${scores[dim.key]} 星` : "未评"}
                </span>
              </div>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => {
                  const active = n <= scores[dim.key];
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setScores({ ...scores, [dim.key]: n })}
                      className="rounded-full p-1 transition-transform active:scale-90 hover:scale-105"
                    >
                      <Star
                        className={`h-8 w-8 transition-colors ${active ? "fill-amber-400 text-amber-400" : "text-gray-200"}`}
                      />
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}

        <Card className="border-0 shadow-sm rounded-xl">
          <CardContent className="p-4">
            <p className="mb-2 text-sm font-semibold text-gray-800">建议与意见（可选）</p>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="你对本次培训有什么建议？"
              rows={4}
              maxLength={500}
              className="rounded-lg resize-none"
            />
          </CardContent>
        </Card>

        <Button
          onClick={onSubmit}
          disabled={submitting || !canSubmit}
          className="mt-2 h-12 w-full rounded-xl text-base bg-gradient-to-r from-[#1677ff] to-[#0958d9] hover:brightness-110 shadow-lg shadow-blue-200"
        >
          {submitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
          提交评价
        </Button>
      </div>
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
