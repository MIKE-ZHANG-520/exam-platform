"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { apiPost, apiPatch } from "@/lib/http";
import { toast } from "sonner";
import { Loader2, Clock, AlertTriangle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

interface Option {
  key: string;
  text: string;
}
interface Item {
  question_id: string;
  type: "single" | "multiple" | "judge";
  content: string;
  options: Option[];
}
interface Pack {
  record_id: string;
  exam_id: string;
  duration_min: number;
  pass_score: number;
  started_at: number;
  items: Item[];
}

const TYPE_LABEL: Record<string, string> = { single: "单选题", multiple: "多选题", judge: "判断题" };

function PaperInner() {
  const params = useParams<{ id: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const rid = sp.get("rid") || "";
  const [pack, setPack] = useState<Pack | null>(null);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [remaining, setRemaining] = useState(0);
  const [switchCount, setSwitchCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const submitted = useRef(false);

  useEffect(() => {
    if (!rid) {
      router.replace(`/exam/${params.id}`);
      return;
    }
    try {
      const raw = sessionStorage.getItem(`exam_paper_${rid}`);
      if (!raw) throw new Error("试卷数据丢失，请重新扫码");
      const p = JSON.parse(raw) as Pack;
      setPack(p);
      const total = p.duration_min * 60;
      const passed = Math.floor((Date.now() - p.started_at) / 1000);
      setRemaining(Math.max(0, total - passed));
    } catch (e) {
      toast.error((e as Error).message);
      router.replace(`/exam/${params.id}`);
    }
  }, [rid, params.id, router]);

  const doSubmit = useCallback(
    async (auto: boolean) => {
      if (!pack || submitted.current) return;
      submitted.current = true;
      setSubmitting(true);
      try {
        const res = await apiPost<{ record_id: string; score: number; is_pass: boolean; pass_score: number; duration_sec: number }>(
          `/api/records/${pack.record_id}/submit`,
          { answers, auto_submit: auto, switch_count: switchCount }
        );
        sessionStorage.removeItem(`exam_paper_${pack.record_id}`);
        router.replace(`/exam/${pack.exam_id}/result?rid=${res.record_id}`);
      } catch (e) {
        toast.error((e as Error).message);
        submitted.current = false;
      } finally {
        setSubmitting(false);
      }
    },
    [pack, answers, switchCount, router]
  );

  // 倒计时
  useEffect(() => {
    if (!pack) return;
    const timer = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          window.clearInterval(timer);
          doSubmit(true);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [pack, doSubmit]);

  // 切屏检测
  useEffect(() => {
    if (!pack) return;
    const onVisible = () => {
      if (document.visibilityState === "hidden") {
        setSwitchCount((c) => {
          const next = c + 1;
          apiPatch(`/api/records/${pack.record_id}`, { switch_count: next }).catch(() => {});
          if (next >= 3) {
            toast.error("切屏次数过多，即将自动交卷");
            setTimeout(() => doSubmit(true), 300);
          } else {
            toast.warning(`已切屏 ${next} 次，再切屏 ${3 - next} 次将自动交卷`);
          }
          return next;
        });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [pack, doSubmit]);

  const item = pack?.items[current];
  const answered = useMemo(() => Object.keys(answers).filter((k) => answers[k].length > 0).length, [answers]);

  if (!pack) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#1E5AA8]" />
      </div>
    );
  }

  const toggle = (key: string) => {
    if (!item) return;
    const cur = answers[item.question_id] || [];
    if (item.type === "multiple") {
      const set = new Set(cur);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      setAnswers({ ...answers, [item.question_id]: Array.from(set).sort() });
    } else {
      setAnswers({ ...answers, [item.question_id]: [key] });
    }
  };

  const min = Math.floor(remaining / 60);
  const sec = remaining % 60;
  const timerAlert = remaining <= 60;
  const total = pack.items.length;

  const onConfirmSubmit = () => {
    const unfinished = total - answered;
    if (unfinished > 0) {
      if (!confirm(`还有 ${unfinished} 道题未作答，确认交卷？`)) return;
    } else {
      if (!confirm("确认交卷？提交后不可修改")) return;
    }
    doSubmit(false);
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      {/* 顶部倒计时 */}
      <div
        className={`sticky top-0 z-10 flex items-center justify-between border-b border-[#E4E7EC] bg-white px-4 py-3 ${
          timerAlert ? "bg-[#FEE2E2]" : ""
        }`}
      >
        <div className={`flex items-center gap-1 tabular-nums ${timerAlert ? "text-[#DC2626]" : "text-[#1E5AA8]"}`}>
          <Clock className="h-4 w-4" />
          <span className="font-mono text-base font-bold">
            {String(min).padStart(2, "0")}:{String(sec).padStart(2, "0")}
          </span>
        </div>
        <span className="text-xs text-[#667085]">
          {current + 1} / {total} · 已答 {answered}
        </span>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="sm" className="text-[#1E5AA8]">
              题卡
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <SheetHeader>
              <SheetTitle>答题卡</SheetTitle>
            </SheetHeader>
            <div className="mt-4 grid grid-cols-5 gap-2 px-4">
              {pack.items.map((it, i) => {
                const has = (answers[it.question_id] || []).length > 0;
                const isCur = i === current;
                return (
                  <button
                    key={it.question_id}
                    onClick={() => setCurrent(i)}
                    className={`h-9 w-9 rounded-md text-sm font-medium ${
                      isCur
                        ? "border-2 border-[#1E5AA8] bg-[#1E5AA8] text-white"
                        : has
                          ? "bg-[#DCFCE7] text-[#166534]"
                          : "border border-[#E4E7EC] bg-white text-[#667085]"
                    }`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {switchCount > 0 && (
        <div className="flex items-center gap-1 bg-[#FEF3C7] px-4 py-1.5 text-xs text-[#B45309]">
          <AlertTriangle className="h-3 w-3" /> 已切屏 {switchCount} 次（超过 3 次将自动交卷）
        </div>
      )}

      {/* 题目 */}
      <div className="flex-1 px-4 py-4">
        {item && (
          <Card className="border-[#E4E7EC]">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="rounded bg-[#1E5AA8] px-1.5 py-0.5 text-xs font-medium text-white">{TYPE_LABEL[item.type]}</span>
                <span className="text-xs text-[#667085]">第 {current + 1} 题</span>
              </div>
              <p className="mb-4 text-base leading-relaxed text-[#1F2937]">{item.content}</p>
              <div className="space-y-2">
                {item.options.map((opt) => {
                  const cur = answers[item.question_id] || [];
                  const checked = cur.includes(opt.key);
                  return (
                    <button
                      key={opt.key}
                      onClick={() => toggle(opt.key)}
                      className={`flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors ${
                        checked ? "border-[#1E5AA8] bg-[#E0EDFF]" : "border-[#E4E7EC] bg-white"
                      }`}
                    >
                      {item.type === "multiple" ? (
                        <Checkbox checked={checked} className="mt-0.5" />
                      ) : (
                        <span
                          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                            checked ? "border-[#1E5AA8] bg-[#1E5AA8]" : "border-[#CBD5E1]"
                          }`}
                        >
                          {checked && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                        </span>
                      )}
                      <span className="text-sm text-[#1F2937]">
                        <span className="font-semibold">{opt.key}.</span> {opt.text}
                      </span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 底部导航 */}
      <div className="sticky bottom-0 flex gap-2 border-t border-[#E4E7EC] bg-white px-4 py-3">
        <Button variant="outline" onClick={() => setCurrent((c) => Math.max(0, c - 1))} disabled={current === 0} className="flex-1">
          上一题
        </Button>
        {current < total - 1 ? (
          <Button onClick={() => setCurrent((c) => Math.min(total - 1, c + 1))} className="flex-1 bg-[#1E5AA8] hover:bg-[#154275]">
            下一题
          </Button>
        ) : (
          <Button onClick={onConfirmSubmit} disabled={submitting} className="flex-1 bg-[#12A150] hover:bg-[#0E7C3F]">
            {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            交卷
          </Button>
        )}
      </div>
    </div>
  );
}

export default function PaperPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-[#667085]">加载中...</div>}>
      <PaperInner />
    </Suspense>
  );
}
