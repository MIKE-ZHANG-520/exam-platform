"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPost } from "@/lib/http";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Clock, GraduationCap } from "lucide-react";

interface Exam {
  id: string;
  title: string;
  paper_type: "A" | "B";
  duration_min: number;
  pass_score: number;
  total_score: number;
  max_attempts: number;
  required_fields: { name: boolean; phone: boolean; team: boolean; id_card: boolean };
  status: string;
}

interface StartResp {
  record_id: string;
  duration_min: number;
  pass_score: number;
  total: number;
  attempt_no: number;
  items: Array<{
    question_id: string;
    type: "single" | "multiple" | "judge";
    content: string;
    options: Array<{ key: string; text: string }>;
  }>;
}

export default function ExamEntryPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [form, setForm] = useState({ candidate_name: "", phone: "", team: "", id_card: "" });

  useEffect(() => {
    apiGet<{ exam: Exam }>(`/api/exams/${params.id}/public`)
      .then((r) => setExam(r.exam))
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [params.id]);

  const onStart = async () => {
    if (!exam) return;
    if (!form.candidate_name.trim()) return toast.error("请填写姓名");
    if (exam.required_fields?.phone && !form.phone.trim()) return toast.error("请填写手机号");
    if (exam.required_fields?.team && !form.team.trim()) return toast.error("请填写班组");
    if (exam.required_fields?.id_card && !form.id_card.trim()) return toast.error("请填写身份证号");
    if (form.phone && !/^1[3-9]\d{9}$/.test(form.phone.trim())) return toast.error("手机号格式不正确");

    setStarting(true);
    try {
      const res = await apiPost<StartResp>(`/api/exams/${params.id}/public`, form);
      // 将试卷内容存入 sessionStorage 供答题页读取
      const pack = {
        record_id: res.record_id,
        exam_id: params.id,
        duration_min: res.duration_min,
        pass_score: res.pass_score,
        started_at: Date.now(),
        items: res.items,
      };
      sessionStorage.setItem(`exam_paper_${res.record_id}`, JSON.stringify(pack));
      router.replace(`/exam/${params.id}/paper?rid=${res.record_id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#1E5AA8]" />
      </div>
    );
  }

  if (!exam) {
    return <div className="p-8 text-center text-sm text-[#DC2626]">试卷不存在或已下线</div>;
  }

  const rf = exam.required_fields || { name: true, phone: true, team: true, id_card: false };

  return (
    <div className="mx-auto max-w-md px-4 pb-10 pt-6">
      <div className="mb-5 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#1E5AA8]/10">
          <GraduationCap className="h-8 w-8 text-[#1E5AA8]" />
        </div>
        <h1 className="text-xl font-semibold text-[#1F2937]">{exam.title}</h1>
        <p className="mt-1 text-xs text-[#667085]">{exam.paper_type === "A" ? "简易卷 A" : "中等卷 B"}</p>
      </div>

      <Card className="mb-4 border-[#E4E7EC]">
        <CardContent className="grid grid-cols-3 divide-x divide-[#E4E7EC] py-4 text-center">
          <div>
            <p className="text-[10px] text-[#667085]">考试时长</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-[#1E5AA8]">{exam.duration_min} 分</p>
          </div>
          <div>
            <p className="text-[10px] text-[#667085]">满分</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-[#1E5AA8]">{exam.total_score}</p>
          </div>
          <div>
            <p className="text-[10px] text-[#667085]">及格线</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-[#1E5AA8]">{exam.pass_score}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4 border-[#E4E7EC]">
        <CardContent className="space-y-3 p-4">
          <p className="text-sm font-medium text-[#1F2937]">考生信息</p>
          <div>
            <Label className="mb-1 block text-xs">
              姓名 <span className="text-[#DC2626]">*</span>
            </Label>
            <Input
              value={form.candidate_name}
              onChange={(e) => setForm({ ...form, candidate_name: e.target.value })}
              placeholder="请填写真实姓名"
              maxLength={20}
            />
          </div>
          {rf.phone && (
            <div>
              <Label className="mb-1 block text-xs">
                手机号 <span className="text-[#DC2626]">*</span>
              </Label>
              <Input
                inputMode="numeric"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 11) })}
                placeholder="用于识别本人考试次数"
              />
            </div>
          )}
          {rf.team && (
            <div>
              <Label className="mb-1 block text-xs">
                班组 <span className="text-[#DC2626]">*</span>
              </Label>
              <Input value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })} placeholder="如：一车间三班" />
            </div>
          )}
          {rf.id_card && (
            <div>
              <Label className="mb-1 block text-xs">
                身份证号 <span className="text-[#DC2626]">*</span>
              </Label>
              <Input value={form.id_card} onChange={(e) => setForm({ ...form, id_card: e.target.value.trim() })} placeholder="18 位身份证号" maxLength={18} />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mb-4 rounded-md border border-[#F2C878] bg-[#FFFBEA] p-3 text-xs text-[#8A6A2E]">
        <p className="mb-1 flex items-center gap-1 font-medium">
          <ShieldCheck className="h-3.5 w-3.5" /> 考试须知
        </p>
        <ul className="list-inside list-disc space-y-0.5">
          <li>共 {exam.duration_min} 分钟，超时自动交卷</li>
          <li>切屏/离开页面超过 3 次将自动交卷</li>
          <li>每人最多 {exam.max_attempts} 次考试机会</li>
          <li>{exam.pass_score} 分及格</li>
        </ul>
      </div>

      <Button onClick={onStart} disabled={starting} className="h-12 w-full bg-[#1E5AA8] text-base hover:bg-[#154275]">
        {starting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Clock className="mr-2 h-5 w-5" />}
        开始考试
      </Button>
    </div>
  );
}
