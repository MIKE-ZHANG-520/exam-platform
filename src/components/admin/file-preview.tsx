"use client"

import type { JSX } from "react"
import { useCallback, useEffect, useState } from "react"
import { Loader2, Download, FileText, Table, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { apiGet } from "@/lib/http"

interface PreviewData {
  fileUrl: string
  fileName: string
  fileType: string
  fileSize: number
}

interface FilePreviewProps {
  materialId: string
}

// ─── PDF 预览（使用浏览器内置 PDF 查看器）───
function PdfPreview({ fileUrl }: { fileUrl: string }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden" style={{ height: "70vh" }}>
      <iframe
        src={fileUrl}
        className="w-full h-full"
        title="PDF Preview"
        onLoad={() => setLoading(false)}
        onError={() => {
          setError("PDF 加载失败")
          setLoading(false)
        }}
      />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      )}
      {error && (
        <div className="flex items-center justify-center gap-2 py-12 text-red-500">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}

// ─── Markdown 预览 ───
function MdPreview({ fileUrl }: { fileUrl: string }) {
  const [content, setContent] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(fileUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.text()
      })
      .then((text) => {
        setContent(text)
        setLoading(false)
      })
      .catch((err) => {
        setError("文件加载失败")
        setLoading(false)
      })
  }, [fileUrl])

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
  if (error) return <div className="text-center py-12 text-red-500">{error}</div>

  return (
    <div className="prose prose-sm max-w-none rounded-lg border border-slate-200 bg-white p-6 overflow-auto" style={{ maxHeight: "70vh" }}>
      <MarkdownContent content={content} />
    </div>
  )
}

// ─── TXT 预览 ───
function TxtPreview({ fileUrl }: { fileUrl: string }) {
  const [content, setContent] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(fileUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.text()
      })
      .then((text) => {
        setContent(text)
        setLoading(false)
      })
      .catch((err) => {
        setError("文件加载失败")
        setLoading(false)
      })
  }, [fileUrl])

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
  if (error) return <div className="text-center py-12 text-red-500">{error}</div>

  return (
    <pre className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-700 whitespace-pre-wrap break-words font-sans leading-relaxed overflow-auto" style={{ maxHeight: "70vh" }}>
      {content}
    </pre>
  )
}

// ─── XLSX 预览 ───
function XlsxPreview({ fileUrl }: { fileUrl: string }) {
  const [sheets, setSheets] = useState<{ name: string; headers: string[]; rows: string[][] }[]>([])
  const [activeSheet, setActiveSheet] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(fileUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.arrayBuffer()
      })
      .then(async (buf) => {
        const XLSX = await import("xlsx")
        const workbook = XLSX.read(new Uint8Array(buf), { type: "array" })
        const result = workbook.SheetNames.map((name) => {
          const sheet = workbook.Sheets[name]
          const json: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" })
          const headers = (json[0] || []).map(String)
          const rows = json.slice(1).map((row) => row.map(String))
          return { name, headers, rows }
        })
        setSheets(result)
        setLoading(false)
      })
      .catch((err) => {
        console.error("[XlsxPreview] error:", err)
        setError("Excel 文件解析失败")
        setLoading(false)
      })
  }, [fileUrl])

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
  if (error) return <div className="text-center py-12 text-red-500">{error}</div>
  if (sheets.length === 0) return <div className="text-center py-12 text-slate-500">文件为空</div>

  const sheet = sheets[activeSheet]

  return (
    <div className="space-y-3">
      {/* Sheet tabs */}
      {sheets.length > 1 && (
        <div className="flex gap-1 overflow-x-auto rounded-lg bg-slate-50 border border-slate-200 p-1">
          {sheets.map((s, i) => (
            <button
              key={s.name}
              onClick={() => setActiveSheet(i)}
              className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                i === activeSheet
                  ? "bg-white text-blue-600 shadow-sm border border-slate-200"
                  : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      {/* Table */}
      <div className="rounded-lg border border-slate-200 overflow-auto" style={{ maxHeight: "65vh" }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b border-slate-200">
              {sheet.headers.map((h, i) => (
                <th key={i} className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap">
                  {h || `列${i + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, ri) => (
              <tr key={ri} className="border-b border-slate-100 hover:bg-blue-50/30 transition-colors">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-1.5 text-slate-700 whitespace-nowrap max-w-[300px] truncate">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-slate-400 text-right">
        共 {sheet.rows.length} 行 x {sheet.headers.length} 列
      </div>
    </div>
  )
}

// ─── DOCX 预览 ───
function DocxPreview({ fileUrl }: { fileUrl: string }) {
  const [html, setHtml] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(fileUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.arrayBuffer()
      })
      .then(async (buf) => {
        const mammoth = await import("mammoth")
        const result = await mammoth.convertToHtml({ arrayBuffer: buf })
        setHtml(result.value)
        setLoading(false)
      })
      .catch((err) => {
        console.error("[DocxPreview] error:", err)
        setError("Word 文件解析失败")
        setLoading(false)
      })
  }, [fileUrl])

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
  if (error) return <div className="text-center py-12 text-red-500">{error}</div>

  return (
    <div
      className="prose prose-sm max-w-none rounded-lg border border-slate-200 bg-white p-6 overflow-auto"
      style={{ maxHeight: "70vh" }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

// ─── 简易 Markdown 渲染（不依赖 react-markdown 的 SSR 问题） ───
function MarkdownContent({ content }: { content: string }) {
  // 简易 markdown 渲染：标题、列表、粗体、代码块
  const lines = content.split("\n")
  const elements: JSX.Element[] = []
  let inCodeBlock = false
  let codeLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <pre key={i} className="bg-slate-100 rounded-md p-3 text-xs overflow-x-auto my-2">
            <code>{codeLines.join("\n")}</code>
          </pre>
        )
        codeLines = []
        inCodeBlock = false
      } else {
        inCodeBlock = true
      }
      continue
    }

    if (inCodeBlock) {
      codeLines.push(line)
      continue
    }

    if (line.startsWith("### ")) {
      elements.push(<h3 key={i} className="text-base font-semibold mt-4 mb-2 text-slate-800">{renderInline(line.slice(4))}</h3>)
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={i} className="text-lg font-semibold mt-5 mb-2 text-slate-900 border-b border-slate-100 pb-1">{renderInline(line.slice(3))}</h2>)
    } else if (line.startsWith("# ")) {
      elements.push(<h1 key={i} className="text-xl font-bold mt-6 mb-3 text-slate-900">{renderInline(line.slice(2))}</h1>)
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <div key={i} className="flex gap-2 ml-2 my-0.5">
          <span className="text-blue-400 mt-0.5">•</span>
          <span className="text-slate-700">{renderInline(line.slice(2))}</span>
        </div>
      )
    } else if (/^\d+\.\s/.test(line)) {
      const match = line.match(/^(\d+)\.\s(.*)$/)
      elements.push(
        <div key={i} className="flex gap-2 ml-2 my-0.5">
          <span className="text-blue-500 font-medium tabular-nums min-w-[20px]">{match?.[1]}.</span>
          <span className="text-slate-700">{renderInline(match?.[2] || "")}</span>
        </div>
      )
    } else if (line.startsWith("> ")) {
      elements.push(
        <blockquote key={i} className="border-l-3 border-blue-300 bg-blue-50/50 pl-3 py-1 my-2 text-slate-600 italic">
          {renderInline(line.slice(2))}
        </blockquote>
      )
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />)
    } else {
      elements.push(<p key={i} className="text-slate-700 my-1 leading-relaxed">{renderInline(line)}</p>)
    }
  }

  return <>{elements}</>
}

function renderInline(text: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = []
  // 处理 **bold** 和 `code`
  const regex = /(\*\*(.+?)\*\*|`(.+?)`)/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    if (match[2]) {
      parts.push(<strong key={match.index} className="font-semibold text-slate-900">{match[2]}</strong>)
    } else if (match[3]) {
      parts.push(<code key={match.index} className="bg-slate-100 text-pink-600 px-1 py-0.5 rounded text-xs">{match[3]}</code>)
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }
  return parts.length > 0 ? parts : [text]
}

// ─── 主组件 ───
export function FilePreview({ materialId }: FilePreviewProps) {
  const [data, setData] = useState<PreviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiGet<PreviewData>(`/api/materials/${materialId}/preview`)
      .then((resp) => {
        setData(resp)
        setLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "加载失败")
        setLoading(false)
      })
  }, [materialId])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <span className="text-sm text-slate-500">加载预览中...</span>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-500">
        <AlertCircle className="h-6 w-6 text-red-400" />
        <span className="text-sm">{error || "加载失败"}</span>
      </div>
    )
  }

  const fileType = data.fileType || ""
  const SUPPORTED_TYPES = ["pdf", "md", "txt", "xlsx", "xls", "docx"]

  if (!SUPPORTED_TYPES.includes(fileType)) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <FileText className="h-10 w-10 text-slate-300" />
        <div className="text-center">
          <p className="text-sm font-medium text-slate-600">暂不支持预览 {fileType.toUpperCase()} 格式</p>
          <p className="text-xs text-slate-400 mt-1">支持 PDF、Markdown、TXT、Excel、Word 文件预览</p>
        </div>
        <Button variant="outline" size="sm" asChild className="mt-2">
          <a href={data.fileUrl} target="_blank" rel="noopener noreferrer">
            <Download className="h-3.5 w-3.5 mr-1.5" />
            下载查看
          </a>
        </Button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <FileText className="h-4 w-4" />
          <span className="truncate max-w-[300px]">{data.fileName}</span>
          <span className="text-xs text-slate-400">
            {data.fileSize ? `${(data.fileSize / 1024).toFixed(1)} KB` : ""}
          </span>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <a href={data.fileUrl} download={data.fileName}>
            <Download className="h-3.5 w-3.5 mr-1" />
            下载
          </a>
        </Button>
      </div>

      {fileType === "pdf" && <PdfPreview fileUrl={data.fileUrl} />}
      {(fileType === "md") && <MdPreview fileUrl={data.fileUrl} />}
      {fileType === "txt" && <TxtPreview fileUrl={data.fileUrl} />}
      {(fileType === "xlsx" || fileType === "xls") && <XlsxPreview fileUrl={data.fileUrl} />}
      {fileType === "docx" && <DocxPreview fileUrl={data.fileUrl} />}
    </div>
  )
}
