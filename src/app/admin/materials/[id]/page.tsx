"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiGet } from "@/lib/http";
import { toast } from "sonner";
import { ArrowLeft, ListTree, Loader2 } from "lucide-react";

interface Outline {
  id: string;
  audience: "worker" | "trainer";
  content_md: string;
  created_at: string;
}

interface Bank {
  id: string;
  title: string;
  difficulty: "easy" | "medium";
  total_count: number;
}

interface Material {
  id: string;
  title: string;
  file_name: string;
}

interface Response {
  material: Material;
  outlines: Outline[];
  banks: Bank[];
}

export default function MaterialDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<Response>(`/api/materials/${id}`)
      .then(setData)
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-[#667085]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载中...
      </div>
    );
  }
  if (!data) return null;

  const worker = data.outlines.find((o) => o.audience === "worker");
  const trainer = data.outlines.find((o) => o.audience === "trainer");

  return (
    <>
      <div className="mb-4">
        <Link href="/admin/materials" className="inline-flex items-center text-sm text-[#667085] hover:text-[#1E5AA8]">
          <ArrowLeft className="mr-1 h-3.5 w-3.5" /> 返回材料列表
        </Link>
      </div>
      <PageHeader title={data.material.title} description={data.material.file_name} />

      {data.banks.length > 0 && (
        <Card className="mb-6 border-[#E4E7EC]">
          <CardHeader>
            <CardTitle className="text-base font-semibold">关联题库</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {data.banks.map((b) => (
              <Link key={b.id} href={`/admin/banks/${b.id}`}>
                <Badge variant="outline" className="cursor-pointer border-[#1E5AA8] px-3 py-1.5 text-[#1E5AA8] hover:bg-[#F2F5FA]">
                  <ListTree className="mr-1 h-3 w-3" />
                  {b.title}（{b.difficulty === "easy" ? "简易" : "中等"} · {b.total_count}题）
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="worker">
        <TabsList>
          <TabsTrigger value="worker">工人版</TabsTrigger>
          <TabsTrigger value="trainer">培训师版</TabsTrigger>
        </TabsList>
        <TabsContent value="worker">
          <Card className="border-[#E4E7EC]">
            <CardContent className="p-6">
              {worker ? (
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[#1F2937]">{worker.content_md}</pre>
              ) : (
                <div className="py-12 text-center text-sm text-[#667085]">
                  暂无工人版提纲，请在材料列表页点击"生成提纲"
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="trainer">
          <Card className="border-[#E4E7EC]">
            <CardContent className="p-6">
              {trainer ? (
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[#1F2937]">{trainer.content_md}</pre>
              ) : (
                <div className="py-12 text-center text-sm text-[#667085]">
                  暂无培训师版提纲，请在材料列表页点击"生成提纲"
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="mt-6 flex justify-end">
        <Link href="/admin/banks">
          <Button className="bg-[#1E5AA8] hover:bg-[#154275]">前往题库管理</Button>
        </Link>
      </div>
    </>
  );
}
