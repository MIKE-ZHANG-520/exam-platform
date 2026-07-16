"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, apiPatch, apiDelete, apiPost } from "@/lib/http";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Pencil, Trash2, Save, X, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type QuestionType = "single" | "multiple" | "judge";

interface QuestionOption {
  key: string;
  text: string;
}

interface Question {
  id: string;
  type: QuestionType;
  content: string;
  options: QuestionOption[];
  answer: string[];
  explanation: string | null;
  order_no: number;
}

interface Bank {
  id: string;
  title: string;
  difficulty: "easy" | "medium";
  total_count: number;
  status?: "draft" | "published";
}

const TYPE_LABEL: Record<QuestionType, { label: string; className: string }> = {
  single: { label: "单选", className: "bg-blue-50 text-[#1677ff] border border-blue-200" },
  multiple: { label: "多选", className: "bg-purple-50 text-purple-700 border border-purple-200" },
  judge: { label: "判断", className: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
};

function defaultOptions(type: QuestionType): QuestionOption[] {
  if (type === "judge") return [{ key: "A", text: "正确" }, { key: "B", text: "错误" }];
  return [
    { key: "A", text: "" },
    { key: "B", text: "" },
    { key: "C", text: "" },
    { key: "D", text: "" },
  ];
}

export default function BankDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [bank, setBank] = useState<Bank | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Question | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<{ bank: Bank; questions: Question[] }>(`/api/banks/${id}`)
      .then((r) => {
        setBank(r.bank);
        setQuestions(r.questions);
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const onPublish = async () => {
    setPublishing(true);
    try {
      await apiPatch(`/api/banks/${id}`, { status: "published" });
      toast.success("题库已发布");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  const openEdit = (q: Question) => {
    setEditing({ ...q, options: [...q.options], answer: [...q.answer] });
    setAdding(false);
  };

  const openAdd = () => {
    setEditing({
      id: "",
      type: "single",
      content: "",
      options: defaultOptions("single"),
      answer: [],
      explanation: "",
      order_no: questions.length + 1,
    });
    setAdding(true);
  };

  const changeType = (t: QuestionType) => {
    if (!editing) return;
    setEditing({ ...editing, type: t, options: defaultOptions(t), answer: [] });
  };

  const onSave = async () => {
    if (!editing) return;
    if (!editing.content.trim()) {
      toast.error("题干不能为空");
      return;
    }
    if (editing.answer.length === 0) {
      toast.error("请选择答案");
      return;
    }
    if (editing.type !== "judge" && editing.options.some((o) => !o.text.trim())) {
      toast.error("请填写全部选项内容");
      return;
    }
    setSaving(true);
    try {
      if (adding) {
        await apiPost(`/api/banks/${id}/questions`, {
          type: editing.type,
          content: editing.content,
          options: editing.options,
          answer: editing.answer,
          explanation: editing.explanation || "",
        });
        toast.success("已新增");
      } else {
        await apiPatch(`/api/questions/${editing.id}`, {
          type: editing.type,
          content: editing.content,
          options: editing.options,
          answer: editing.answer,
          explanation: editing.explanation || "",
        });
        toast.success("已保存");
      }
      setEditing(null);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (qid: string) => {
    if (!confirm("确认删除该题目？")) return;
    try {
      await apiDelete(`/api/questions/${qid}`);
      toast.success("已删除");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-8 w-64 rounded" />
        <div className="skeleton h-32 w-full rounded-xl" />
        <div className="skeleton h-32 w-full rounded-xl" />
      </div>
    );
  }
  if (!bank) return null;

  const isJudge = editing?.type === "judge";
  const published = (bank.status || "draft") === "published";

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/banks" className="inline-flex items-center text-sm text-gray-500 hover:text-[#1677ff]">
          <ArrowLeft className="mr-1 h-3.5 w-3.5" /> 返回题库列表
        </Link>
      </div>
      <div className="brand-card rounded-xl p-5 flex flex-wrap items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-semibold text-gray-900">{bank.title}</h1>
            <Badge
              variant="outline"
              className={
                published
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-orange-50 text-orange-700 border-orange-200"
              }
            >
              {published ? "已发布" : "待审"}
            </Badge>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            难度：{bank.difficulty === "easy" ? "简易" : "中等"} · 共 {questions.length} 题
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" onClick={openAdd}>
            <Plus className="mr-1 h-4 w-4" /> 新增题目
          </Button>
          {!published && (
            <Button onClick={onPublish} disabled={publishing} className="bg-[#1677ff] hover:bg-[#0958d9]">
              {publishing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              审核通过并发布
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {questions.map((q, idx) => {
          const t = TYPE_LABEL[q.type];
          return (
            <Card key={q.id} className="brand-card border-0 hover:shadow-md transition">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white text-xs font-semibold">
                        {idx + 1}
                      </span>
                      <span className={`px-2 py-0.5 rounded-md text-[11px] ${t.className}`}>{t.label}</span>
                    </div>
                    <p className="mb-3 text-[14px] leading-6 text-gray-900">{q.content}</p>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {q.options.map((opt) => {
                        const isAns = q.answer.includes(opt.key);
                        return (
                          <div
                            key={opt.key}
                            className={`rounded-lg border px-3 py-2 text-xs ${
                              isAns
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-gray-200 text-gray-600 bg-gray-50/60"
                            }`}
                          >
                            <span className="font-semibold">{opt.key}.</span> {opt.text}
                            {isAns && <span className="ml-2 text-[10px] text-emerald-600">✓ 正确答案</span>}
                          </div>
                        );
                      })}
                    </div>
                    {q.explanation && (
                      <p className="mt-3 rounded-lg bg-blue-50/50 border border-blue-100 px-3 py-2 text-xs text-gray-600">
                        <span className="font-semibold text-[#1677ff]">解析：</span>
                        {q.explanation}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(q)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDelete(q.id)}
                      className="text-red-500 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{adding ? "新增题目" : "编辑题目"}</DialogTitle>
            <DialogDescription>修改题干、选项与答案后点击保存</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label className="mb-1.5 block">题型</Label>
                <Select value={editing.type} onValueChange={(v) => changeType(v as QuestionType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">单选题</SelectItem>
                    <SelectItem value="multiple">多选题</SelectItem>
                    <SelectItem value="judge">判断题</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5 block">题干</Label>
                <Textarea
                  value={editing.content}
                  onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                  rows={2}
                  placeholder="请输入题干"
                />
              </div>

              {isJudge ? (
                <div>
                  <Label className="mb-1.5 block">答案</Label>
                  <RadioGroup
                    value={editing.answer[0] || ""}
                    onValueChange={(v) => setEditing({ ...editing, answer: [v] })}
                    className="flex gap-4"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="A" id="j-t" />
                      <Label htmlFor="j-t">正确</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="B" id="j-f" />
                      <Label htmlFor="j-f">错误</Label>
                    </div>
                  </RadioGroup>
                </div>
              ) : (
                <div>
                  <Label className="mb-1.5 block">选项与答案（勾选正确项）</Label>
                  <div className="space-y-2">
                    {editing.options.map((opt, i) => {
                      const checked = editing.answer.includes(opt.key);
                      return (
                        <div key={opt.key} className="flex items-center gap-2">
                          {editing.type === "single" ? (
                            <input
                              type="radio"
                              name="opt"
                              checked={checked}
                              onChange={() => setEditing({ ...editing, answer: [opt.key] })}
                              className="h-4 w-4 accent-[#1E5AA8]"
                            />
                          ) : (
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) => {
                                const set = new Set(editing.answer);
                                if (v) set.add(opt.key);
                                else set.delete(opt.key);
                                setEditing({ ...editing, answer: Array.from(set).sort() });
                              }}
                            />
                          )}
                          <span className="w-5 shrink-0 text-sm font-semibold text-[#667085]">{opt.key}.</span>
                          <Input
                            value={opt.text}
                            onChange={(e) => {
                              const arr = editing.options.map((o) => (o.key === opt.key ? { ...o, text: e.target.value } : o));
                              setEditing({ ...editing, options: arr });
                            }}
                            placeholder={`选项 ${opt.key}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <Label className="mb-1.5 block">解析（可选）</Label>
                <Textarea
                  value={editing.explanation || ""}
                  onChange={(e) => setEditing({ ...editing, explanation: e.target.value })}
                  rows={2}
                  placeholder="答案解析"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              <X className="mr-1 h-4 w-4" /> 取消
            </Button>
            <Button onClick={onSave} disabled={saving} className="bg-[#1677ff] hover:bg-[#0958d9]">
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
