"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { FilePreview } from "@/components/admin/file-preview"
import { apiGet } from "@/lib/http"
import { Loader2, FileText, ArrowLeft, Download, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface MaterialData {
  material: {
    id: string
    title: string
    file_name: string
    file_type: string
    file_size: number
    status: string
    file_url?: string
  }
}

export default function MaterialPreviewPage() {
  const params = useParams()
  const id = params.id as string
  const [data, setData] = useState<MaterialData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiGet<MaterialData>(`/api/materials/${id}`)
      .then((res) => {
        setData(res)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message || "加载失败")
        setLoading(false)
      })
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className="text-sm text-slate-500">加载预览...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-red-500">
          <FileText className="h-10 w-10 text-slate-300" />
          <p className="text-sm">{error || "材料不存在"}</p>
          <Link href="/admin/materials">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" />
              返回列表
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  const isParsed = data.material.status === "parsed"

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <Link href={`/admin/materials/${id}`}>
                <Button variant="ghost" size="sm" className="gap-1">
                  <ArrowLeft className="w-4 h-4" />
                  返回
                </Button>
              </Link>
              <div className="h-5 w-px bg-slate-200" />
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-500" />
                <h1 className="text-sm font-medium text-slate-900 truncate max-w-md">
                  {data.material.file_name}
                </h1>
                <span className="text-xs text-slate-500 uppercase bg-slate-100 px-2 py-0.5 rounded">
                  {data.material.file_type}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {data.material.file_url && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => window.open(data.material.file_url, "_blank")}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  原始文件
                </Button>
              )}
              {data.material.file_url && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => {
                    const link = document.createElement("a")
                    link.href = data.material.file_url!
                    link.download = data.material.file_name
                    link.click()
                  }}
                >
                  <Download className="w-3.5 h-3.5" />
                  下载
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Preview Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {isParsed ? (
          <FilePreview materialId={id} />
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-500">
            <FileText className="h-12 w-12 text-slate-300" />
            <p className="text-sm">文件尚未解析，请先在详情页解析文件</p>
            <Link href={`/admin/materials/${id}`}>
              <Button variant="outline" size="sm">
                前往详情页
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
