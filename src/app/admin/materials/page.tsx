"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiDelete, apiGet, apiPost, fmtDate } from "@/lib/http";
import { toast } from "sonner";
import { Loader2, Upload, Trash2, FileText, Sparkles, ListTree, ArrowRight } from "lucide-react";
import Link from "next/link";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Material {
  id: string;
  title: string;
  file_name: string;
  file_type: string;
  file_size: number;
  status: string;
  error_message: string | null;
  created_at: string;
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  uploaded: { label: "已上传", className: "bg-[#E0EDFF] text-[#1E5AA8]" },
  parsing: { label: "解析中", className: "bg-[#FEF3C7] text-[#B45309]" },
  parsed: { label: "已解析", className: "bg-[#DCFCE7] text-[#166534]" },
  generating: { label: "生成中", className: "bg-[#FEF3C7] text-[#B45309]" },
  ready: { label: "已就绪", className: "bg-[#DCFCE7] text-[#166534]" },
  failed: { label: "失败", className: "bg-[#FEE2E2] text-[#DC2626]" },
};

export default function MaterialsPage() {
  const [items, setItems] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<{ items: Material[] }>("/api/materials")
      .then((r) => setItems(r.items))
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiPost<{ material: { id: string } }>("/api/materials", fd);
      toast.success("上传成功，正在解析...");
      // 自动触发解析
      apiPost(`/api/materials/${res.material.id}/parse`, {}).catch(() => {});
      // 稍后刷新
      setTimeout(load, 1500);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onGenerate = async (id: string, type: "outline" | "questions") => {
    setBusyId(id);
    try {
      await apiPost(`/api/materials/${id}/${type}`, {});
      toast.success(type === "outline" ? "培训提纲生成成功" : "题库生成成功");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (id: string) => {
    try {
      await apiDelete(`/api/materials/${id}`);
      toast.success("已删除");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <>
      <PageHeader
        title="培训材料"
        description="上传培训文档，一键生成培训提纲与考试题库"
        right={
          <>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept=".docx,.xlsx,.pdf,.pptx,.md,.txt"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
              }}
            />
            <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="bg-[#1E5AA8] hover:bg-[#154275]">
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              上传材料
            </Button>
          </>
        }
      />

      {loading ? (
        <div className="flex h-40 items-center justify-center text-sm text-[#667085]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载中...
        </div>
      ) : items.length === 0 ? (
        <Card className="border-dashed border-[#CBD5E1]">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="mb-3 h-10 w-10 text-[#667085]" />
            <p className="mb-1 text-sm font-medium text-[#1F2937]">还没有上传任何培训材料</p>
            <p className="text-xs text-[#667085]">支持 docx / xlsx / pdf / pptx / md 格式</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((m) => {
            const st = STATUS_MAP[m.status] || STATUS_MAP.uploaded;
            const canGen = m.status !== "uploaded" && m.status !== "parsing";
            return (
              <Card key={m.id} className="border-[#E4E7EC] transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#F2F5FA]">
                        <FileText className="h-5 w-5 text-[#1E5AA8]" />
                      </div>
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm font-medium text-[#1F2937]">{m.title}</p>
                        <p className="mt-0.5 truncate text-xs text-[#667085]">{m.file_name}</p>
                        <p className="mt-0.5 text-xs text-[#667085]">
                          {(m.file_size / 1024).toFixed(1)} KB · {fmtDate(m.created_at)}
                        </p>
                      </div>
                    </div>
                    <Badge className={`${st.className} shrink-0 text-xs`}>{st.label}</Badge>
                  </div>

                  {m.status === "failed" && m.error_message && (
                    <p className="mb-2 rounded-md bg-[#FEE2E2] px-2 py-1 text-xs text-[#DC2626]">{m.error_message}</p>
                  )}

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" disabled={!canGen || busyId === m.id} onClick={() => onGenerate(m.id, "outline")}>
                      {busyId === m.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
                      生成提纲
                    </Button>
                    <Button variant="outline" size="sm" disabled={!canGen || busyId === m.id} onClick={() => onGenerate(m.id, "questions")}>
                      <ListTree className="mr-1 h-3 w-3" />
                      生成题库
                    </Button>
                  </div>

                  <div className="mt-3 flex items-center gap-2 border-t border-dashed border-[#E4E7EC] pt-3">
                    <Link href={`/admin/materials/${m.id}`} className="flex-1">
                      <Button variant="ghost" size="sm" className="w-full text-[#1E5AA8] hover:bg-[#F2F5FA]">
                        查看详情
                        <ArrowRight className="ml-auto h-3 w-3" />
                      </Button>
                    </Link>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-[#DC2626] hover:bg-[#FEE2E2] hover:text-[#DC2626]">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>删除该材料？</AlertDialogTitle>
                          <AlertDialogDescription>删除后材料原文与关联的提纲、题库将全部移除。</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>取消</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onDelete(m.id)} className="bg-[#DC2626] hover:bg-[#B91C1C]">
                            确认删除
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
