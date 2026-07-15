"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
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
    Promise.all([apiGet<{ items: Exam[] }>("/api/exams"), apiGet<{ items: Bank[] }>("/api/banks")])
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
    <>
      <PageHeader
        title="考试试卷"
        description="配置试卷并生成扫码入口"
        right={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-[#1E5AA8] hover:bg-[#154275]">
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
                      <SelectValue placeholder={filteredBanks.length ? "选择题库" : "无可用题库，请先生成"} />
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
                <Button onClick={onCreate} disabled={creating} className="bg-[#1E5AA8] hover:bg-[#154275]">
                  {creating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                  创建
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {loading ? (
        <div className="flex h-40 items-center justify-center text-sm text-[#667085]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载中...
        </div>
      ) : items.length === 0 ? (
        <Card className="border-dashed border-[#CBD5E1]">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ClipboardCheck className="mb-3 h-10 w-10 text-[#667085]" />
            <p className="mb-1 text-sm font-medium text-[#1F2937]">还没有试卷</p>
            <p className="text-xs text-[#667085]">先生成题库，再创建试卷</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((exam) => (
            <Card key={exam.id} className="border-[#E4E7EC] transition-shadow hover:shadow-md">
              <CardContent className="p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#1F2937]">{exam.title}</p>
                    <p className="mt-1 truncate font-mono text-xs text-[#667085]">ID：{exam.id.slice(0, 8)}...</p>
                  </div>
                  <Badge className={exam.paper_type === "A" ? "bg-[#DCFCE7] text-[#166534]" : "bg-[#E0EDFF] text-[#1E5AA8]"}>
                    {exam.paper_type === "A" ? "A 卷 · 简易" : "B 卷 · 中等"}
                  </Badge>
                </div>
                <div className="mb-3 space-y-1 rounded-md bg-[#F2F5FA] px-3 py-2 text-xs text-[#667085]">
                  <div>题库：{bankMap[exam.bank_id] || "(已删除)"}</div>
                  <div>
                    时长 {exam.duration_min} 分钟 · 及格 {exam.pass_score} 分 · 最多 {exam.max_attempts} 次
                  </div>
                  <div>创建于 {fmtDate(exam.created_at)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => openQr(exam)} className="flex-1">
                    <QrCode className="mr-1 h-4 w-4" /> 二维码
                  </Button>
                  <Link href={`/admin/records?exam_id=${exam.id}`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full">
                      记录 <ArrowRight className="ml-auto h-3 w-3" />
                    </Button>
                  </Link>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-[#DC2626] hover:bg-[#FEE2E2] hover:text-[#DC2626]">
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
                        <AlertDialogAction onClick={() => onDelete(exam.id)} className="bg-[#DC2626] hover:bg-[#B91C1C]">
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
              <img src={qrUrl} alt="qrcode" width={240} height={240} className="rounded-md border border-[#E4E7EC] p-2" />
            ) : (
              <div className="flex h-60 w-60 items-center justify-center text-sm text-[#667085]">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 生成中...
              </div>
            )}
            <p className="break-all text-center text-xs text-[#667085]">{qrLink}</p>
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
    </>
  );
}
