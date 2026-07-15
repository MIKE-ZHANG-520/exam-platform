"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiGet, fmtDate } from "@/lib/http";
import { toast } from "sonner";
import { Loader2, ListTree, ArrowRight } from "lucide-react";

interface Bank {
  id: string;
  material_id: string;
  title: string;
  difficulty: "easy" | "medium";
  total_count: number;
  created_at: string;
}

export default function BanksPage() {
  const [items, setItems] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<{ items: Bank[] }>("/api/banks")
      .then((r) => setItems(r.items))
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <PageHeader title="题库管理" description="所有由培训材料生成的题库" />

      {loading ? (
        <div className="flex h-40 items-center justify-center text-sm text-[#667085]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载中...
        </div>
      ) : items.length === 0 ? (
        <Card className="border-dashed border-[#CBD5E1]">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ListTree className="mb-3 h-10 w-10 text-[#667085]" />
            <p className="mb-1 text-sm font-medium text-[#1F2937]">还没有题库</p>
            <p className="text-xs text-[#667085]">请先上传材料并生成题库</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((b) => (
            <Card key={b.id} className="border-[#E4E7EC] transition-shadow hover:shadow-md">
              <CardContent className="p-4">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="line-clamp-2 text-sm font-medium text-[#1F2937]">{b.title}</p>
                    <p className="mt-1 text-xs text-[#667085]">{fmtDate(b.created_at)}</p>
                  </div>
                  <Badge className={b.difficulty === "easy" ? "bg-[#DCFCE7] text-[#166534]" : "bg-[#E0EDFF] text-[#1E5AA8]"}>
                    {b.difficulty === "easy" ? "简易" : "中等"}
                  </Badge>
                </div>
                <div className="mb-3 flex items-center justify-between rounded-md bg-[#F2F5FA] px-3 py-2 text-sm">
                  <span className="text-[#667085]">题目数量</span>
                  <span className="font-semibold text-[#1F2937] tabular-nums">{b.total_count} 题</span>
                </div>
                <Link href={`/admin/banks/${b.id}`}>
                  <Button variant="outline" size="sm" className="w-full">
                    查看题目 <ArrowRight className="ml-auto h-3 w-3" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
