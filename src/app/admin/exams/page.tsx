"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, apiPost, apiDelete, fmtDate } from "@/lib/http";
import { toast } from "sonner";
import { Plus, Loader2, ClipboardCheck, QrCode, Trash2, Download, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface Exam {
  id: string;
  title: string;
  bank_id: string;
  paper_type: "A" | "B";
  duration_min: number;
  pass_score: number;
  total_score: number;
  max_attempts: number;
  config: { single: number; multiple: number; judge: number };
  status: string;
  created_at: string;
}

interface Bank {
  id: string;
  title: string;
  difficulty: "easy" | "medium";
  total_count: number;
}

export default function ExamsPage() {
  const [items, setItems] = useState<Exam[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankMap, setBankMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [qrExam, setQrExam] = useState<Exam | null>(null);
  const [qrUrl, setQrUrl] = useState<string>("");
  const [qrLink, setQrLink] = useState<string>("");

  const [form, setForm] = useState<{ title: string; paper_type: "A" | "B"; bank_id: string }>({
    title: "",
    paper_type: "A",
    bank_id: "",
  });

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([apiGet<{ items: Exam[] }>("/api/exams"), apiGet<{ items: Bank[] }>("/api/banks?status=published")])
      .then(([e, b]) => {
        setItems(e.items);
        setBanks(b.items);
        setBankMap(Object.fromEntries(b.items.map((x) => [x.id, x.title])));
      })
      .catch((err: Error) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onCreate = async () => {
    if (!form.title.trim()) {
      toast.error("请输入试卷标题");
      return;
    }
    if (!form.bank_id) {
      toast.error("请选择题库");
      return;
    }
    setCreating(true);
    try {
      await apiPost("/api/exams", form);
      toast.success("试卷创建成功");
      setDialogOpen(false);
      setForm({ title: "", paper_type: "A", bank_id: "" });
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const onDelete = async (id: string) => {
    try {
      await apiDelete(`/api/exams/${id}`);
      toast.success("已删除");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const openQr = async (exam: Exam) => {
    setQrExam(exam);
    setQrUrl("");
    setQrLink("");
    try {
      const res = await apiGet<{ url: string; data_url: string }>(`/api/exams/${exam.id}/qrcode`);
      setQrUrl(res.data_url);
      setQrLink(res.url);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const filteredBanks = banks.filter((b) => (form.paper_type === "A" ? b.difficulty === "easy" : b.difficulty === "medium"));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-semibold text-gray-900">考试试卷</h1>
          <p className="text-sm text-gray-500 mt-0.5">配置试卷、生成扫码入口，工人扫码即可参考</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#1677ff] hover:bg-[#0958d9] shadow-sm">
              <Plus className="mr-1 h-4 w-4" /> 新建试卷
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新建试卷</DialogTitle>
              <DialogDescription>
                A 卷（简易）：20题（单选10+判断10）· 20分钟 · 80分及格<br />
                B 卷（中等）：20题（单选8+多选6+判断6）· 30分钟 · 80分及格
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label className="mb-1.5 block">试卷标题</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="如：安全生产培训 A 卷" />
              </div>
              <div>
                <Label className="mb-1.5 block">试卷类型</Label>
                <Select value={form.paper_type} onValueChange={(v) => setForm({ ...form, paper_type: v as "A" | "B", bank_id: "" })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">A 卷 · 简易（20题 / 20分钟）</SelectItem>
                    <SelectItem value="B">B 卷 · 中等（20题 / 30分钟）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5 block">抽题题库（{form.paper_type === "A" ? "简易" : "中等"}）</Label>
                <Select value={form.bank_id} onValueChange={(v) => setForm({ ...form, bank_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder={filteredBanks.length ? "选择题库" : "无可用题库，请先发布题库"} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredBanks.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.title}（{b.total_count} 题）
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={onCreate} disabled={creating} className="bg-[#1677ff] hover:bg-[#0958d9]">
                {creating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                创建
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-48 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="brand-card rounded-xl py-16 flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center mb-3">
            <ClipboardCheck className="w-7 h-7 text-[#1677ff]" />
          </div>
          <p className="text-[15px] font-medium text-gray-800">还没有试卷</p>
          <p className="text-xs text-gray-500 mt-1">先在题库详情审核发布后，再来这里创建试卷</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((exam) => (
            <Card key={exam.id} className="brand-card border-0 hover-lift">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${exam.paper_type === "A" ? "bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-600" : "bg-gradient-to-br from-blue-50 to-blue-100 text-[#1677ff]"}`}>
                    <ClipboardCheck className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[14px] font-semibold text-gray-900 line-clamp-1">{exam.title}</div>
                      <Badge className={exam.paper_type === "A" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-blue-50 text-[#1677ff] border border-blue-200"}>
                        {exam.paper_type === "A" ? "A · 简易" : "B · 中等"}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-gray-500 mt-1">{fmtDate(exam.created_at)}</div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 rounded-lg bg-gray-50 divide-x divide-gray-200 text-center">
                  <div className="py-2">
                    <div className="text-[11px] text-gray-500">时长</div>
                    <div className="text-sm font-semibold text-gray-900 tabular-nums">{exam.duration_min}min</div>
                  </div>
                  <div className="py-2">
                    <div className="text-[11px] text-gray-500">及格</div>
                    <div className="text-sm font-semibold text-gray-900 tabular-nums">{exam.pass_score}分</div>
                  </div>
                  <div className="py-2">
                    <div className="text-[11px] text-gray-500">机会</div>
                    <div className="text-sm font-semibold text-gray-900 tabular-nums">{exam.max_attempts}次</div>
                  </div>
                </div>
                <div className="mt-2 text-[11px] text-gray-400 truncate">题库：{bankMap[exam.bank_id] || "(已删除)"}</div>
                <div className="mt-3 flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => openQr(exam)} className="flex-1 hover:border-[#1677ff] hover:text-[#1677ff]">
                    <QrCode className="mr-1 h-4 w-4" /> 二维码
                  </Button>
                  <Link href={`/admin/records?exam_id=${exam.id}`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full hover:border-[#1677ff] hover:text-[#1677ff]">
                      记录 <ArrowRight className="ml-auto h-3 w-3" />
                    </Button>
                  </Link>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-red-500 hover:bg-red-50 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>删除该试卷？</AlertDialogTitle>
                        <AlertDialogDescription>已产生的考试记录不受影响。</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={() => onDelete(exam.id)} className="bg-red-500 hover:bg-red-600">
                          确认删除
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!qrExam} onOpenChange={(v) => !v && setQrExam(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{qrExam?.title}</DialogTitle>
            <DialogDescription>工人扫码即可进入考试</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            {qrUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={qrUrl} alt="qrcode" width={240} height={240} className="rounded-lg border border-gray-200 p-2 bg-white" />
            ) : (
              <div className="flex h-60 w-60 items-center justify-center text-sm text-gray-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 生成中...
              </div>
            )}
            <p className="break-all text-center text-xs text-gray-500">{qrLink}</p>
            {qrUrl && (
              <a href={qrUrl} download={`exam-${qrExam?.id}.png`}>
                <Button variant="outline" size="sm">
                  <Download className="mr-1 h-4 w-4" /> 下载二维码
                </Button>
              </a>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
