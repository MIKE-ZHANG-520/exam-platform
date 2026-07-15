"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, AlertTriangle, XCircle, Sparkles, ListOrdered, Clock, Lightbulb, MessageCircle, BookOpen } from "lucide-react"

/**
 * 提纲组件化渲染器
 * 输入：Markdown 字符串（AI 生成的提纲）
 * 输出：卡片化章节 + 语义化图标 + 目录导航
 */

type OutlineBlock =
	| { kind: "heading"; level: 2 | 3; text: string; id: string }
	| { kind: "para"; text: string }
	| { kind: "callout"; tag: "success" | "warn" | "danger" | "tip" | "quote" | "info"; text: string }
	| { kind: "list"; items: string[]; ordered: boolean; startIdx?: number }
	| { kind: "quote"; text: string }

interface Section {
	id: string
	title: string
	blocks: OutlineBlock[]
}

const CIRCLED_NUM = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳"

function slug(s: string, idx: number): string {
	return `sec-${idx}-` + s.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 24).replace(/^-|-$/g, "").toLowerCase()
}

/** 简易 markdown 解析（够用即可，不引入完整解析器） */
function parseMarkdown(md: string): Section[] {
	const lines = md.split(/\r?\n/)
	const sections: Section[] = []
	let current: Section = { id: "sec-0-intro", title: "开篇", blocks: [] }
	let sectionIdx = 0

	const pushList = (buf: string[], ordered: boolean, startIdx?: number) => {
		if (buf.length === 0) return
		current.blocks.push({ kind: "list", items: buf.slice(), ordered, startIdx })
		buf.length = 0
	}

	let listBuf: string[] = []
	let listOrdered = false
	let listStart: number | undefined

	const flushList = () => {
		if (listBuf.length > 0) {
			pushList(listBuf, listOrdered, listStart)
			listOrdered = false
			listStart = undefined
		}
	}

	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i]
		const line = raw.trim()

		// 章节标题
		const h2 = /^##\s+(.+)$/.exec(line)
		const h3 = /^###\s+(.+)$/.exec(line)
		if (h2 || h3) {
			flushList()
			if (h2) {
				if (current.blocks.length > 0 || current.title !== "开篇") sections.push(current)
				sectionIdx++
				const title = h2[1].trim()
				current = { id: slug(title, sectionIdx), title, blocks: [] }
			} else if (h3) {
				current.blocks.push({ kind: "heading", level: 3, text: h3[1].trim(), id: slug(h3[1], i) })
			}
			continue
		}

		if (line === "") {
			flushList()
			continue
		}

		// 引用 / 口诀
		if (line.startsWith(">")) {
			flushList()
			const text = line.replace(/^>+\s?/, "")
			current.blocks.push({ kind: "callout", tag: "quote", text })
			continue
		}

		// 有序列表
		const ol = /^(\d+)[.)、]\s+(.+)$/.exec(line)
		if (ol) {
			if (!listOrdered && listBuf.length > 0) flushList()
			if (!listOrdered) {
				listOrdered = true
				listStart = parseInt(ol[1], 10) || 1
			}
			listBuf.push(ol[2])
			continue
		}

		// 无序列表 / 特殊标记条目
		const ul = /^[-*+]\s+(.+)$/.exec(line)
		if (ul) {
			if (listOrdered && listBuf.length > 0) flushList()
			const item = ul[1]
			const callout = detectCallout(item)
			if (callout) {
				flushList()
				current.blocks.push(callout)
			} else {
				listOrdered = false
				listBuf.push(item)
			}
			continue
		}

		// 独立行的特殊标记
		const callout = detectCallout(line)
		if (callout) {
			flushList()
			current.blocks.push(callout)
			continue
		}

		flushList()
		current.blocks.push({ kind: "para", text: line })
	}
	flushList()
	if (current.blocks.length > 0 || current.title !== "开篇") sections.push(current)

	return sections
}

function detectCallout(text: string): OutlineBlock | null {
	const t = text.trim()
	if (/^✅|正确做法[:：]?/.test(t)) return { kind: "callout", tag: "success", text: t.replace(/^✅\s*/, "") }
	if (/^⚠️|注意事项[:：]?|注意[:：]/.test(t)) return { kind: "callout", tag: "warn", text: t.replace(/^⚠️\s*/, "") }
	if (/^🔴|禁止|严禁/.test(t)) return { kind: "callout", tag: "danger", text: t.replace(/^🔴\s*/, "") }
	if (/^💡|口诀[:：]?|记忆[:：]/.test(t)) return { kind: "callout", tag: "tip", text: t.replace(/^💡\s*/, "") }
	if (/^ℹ️|提示[:：]?/.test(t)) return { kind: "callout", tag: "info", text: t.replace(/^ℹ️\s*/, "") }
	return null
}

/** 将 **粗体** 与 `代码` 简单渲染 */
function inline(text: string): React.ReactNode {
	const parts: React.ReactNode[] = []
	const re = /(\*\*[^*]+\*\*|`[^`]+`|【[^】]+】)/g
	let last = 0
	let m: RegExpExecArray | null
	let idx = 0
	while ((m = re.exec(text)) !== null) {
		if (m.index > last) parts.push(text.slice(last, m.index))
		const seg = m[0]
		if (seg.startsWith("**")) {
			parts.push(
				<mark key={idx++} className="bg-red-50 text-red-600 font-semibold px-1 rounded-sm mx-0.5">
					{seg.slice(2, -2)}
				</mark>,
			)
		} else if (seg.startsWith("`")) {
			parts.push(
				<code key={idx++} className="text-[13px] bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded font-mono mx-0.5">
					{seg.slice(1, -1)}
				</code>,
			)
		} else {
			parts.push(
				<span key={idx++} className="text-[#1677ff] font-medium">
					{seg}
				</span>,
			)
		}
		last = m.index + seg.length
	}
	if (last < text.length) parts.push(text.slice(last))
	return parts.length > 0 ? parts : text
}

type CalloutTag = "success" | "warn" | "danger" | "tip" | "quote" | "info"

function Callout({ tag, text }: { tag: CalloutTag; text: string }) {
	const map: Record<string, { icon: React.ComponentType<{ className?: string }>; bg: string; border: string; iconColor: string; label?: string }> = {
		success: { icon: CheckCircle2, bg: "bg-green-50", border: "border-green-200", iconColor: "text-green-600", label: "正确做法" },
		warn: { icon: AlertTriangle, bg: "bg-orange-50", border: "border-orange-200", iconColor: "text-orange-600", label: "注意事项" },
		danger: { icon: XCircle, bg: "bg-red-50", border: "border-red-200", iconColor: "text-red-600", label: "严禁行为" },
		tip: { icon: Sparkles, bg: "bg-yellow-50", border: "border-yellow-300", iconColor: "text-yellow-600", label: "记忆口诀" },
		info: { icon: Lightbulb, bg: "bg-blue-50", border: "border-blue-200", iconColor: "text-blue-600", label: "提示" },
		quote: { icon: BookOpen, bg: "bg-yellow-50", border: "border-yellow-400", iconColor: "text-yellow-700", label: "口诀" },
	}
	const cfg = map[tag]
	const Icon = cfg.icon
	if (tag === "quote") {
		return (
			<div className={`my-2 p-3 pl-4 border-l-4 ${cfg.border} ${cfg.bg} rounded-r-md flex gap-2 items-start`}>
				<Icon className={`w-4 h-4 mt-0.5 shrink-0 ${cfg.iconColor}`} />
				<div className="text-[14px] leading-relaxed text-gray-800 italic">{inline(text)}</div>
			</div>
		)
	}
	return (
		<div className={`my-2 rounded-lg border ${cfg.border} ${cfg.bg} px-3 py-2.5 flex gap-2.5 items-start`}>
			<Icon className={`w-4 h-4 mt-0.5 shrink-0 ${cfg.iconColor}`} />
			<div className="text-[14px] leading-relaxed text-gray-800 flex-1">
				{cfg.label && <span className={`text-[11px] font-medium ${cfg.iconColor} mr-1.5`}>[{cfg.label}]</span>}
				{inline(text)}
			</div>
		</div>
	)
}

function NumberBullet({ n }: { n: number }) {
	return (
		<span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-[#1677ff] to-[#0958d9] text-white text-[12px] font-semibold shrink-0 shadow-sm">
			{n}
		</span>
	)
}

function CircledNumber({ n }: { n: number }) {
	return <span className="text-[#1677ff] font-medium mr-1">{n >= 1 && n <= 20 ? CIRCLED_NUM[n - 1] : `(${n})`}</span>
}

function renderBlock(b: OutlineBlock, idx: number, audience: "worker" | "trainer") {
	if (b.kind === "heading" && b.level === 3) {
		return (
			<h3 key={idx} id={b.id} className="text-[15px] font-semibold text-gray-800 mt-4 mb-1.5 flex items-center gap-2">
				<span className="w-1 h-4 rounded-sm bg-[#1677ff]" />
				{b.text}
			</h3>
		)
	}
	if (b.kind === "para") {
		return (
			<p key={idx} className="text-[14px] leading-[1.75] text-gray-700 my-1.5">
				{inline(b.text)}
			</p>
		)
	}
	if (b.kind === "callout") return <Callout key={idx} tag={b.tag} text={b.text} />
	if (b.kind === "list") {
		if (b.ordered) {
			return (
				<ol key={idx} className="my-2 space-y-2">
					{b.items.map((it, i) => (
						<li key={i} className="flex gap-2.5 items-start">
							{audience === "worker" ? <NumberBullet n={(b.startIdx || 1) + i} /> : <CircledNumber n={(b.startIdx || 1) + i} />}
							<div className="text-[14px] leading-relaxed text-gray-800 flex-1">{inline(it)}</div>
						</li>
					))}
				</ol>
			)
		}
		return (
			<ul key={idx} className="my-2 space-y-1.5">
				{b.items.map((it, i) => (
					<li key={i} className="flex gap-2 items-start">
						<span className="mt-2 w-1.5 h-1.5 rounded-full bg-[#1677ff] shrink-0" />
						<div className="text-[14px] leading-relaxed text-gray-800 flex-1">{inline(it)}</div>
					</li>
				))}
			</ul>
		)
	}
	return null
}

/** 判断培训师版章节主题色 */
function trainerTheme(title: string): { gradient: string; ring: string; icon: React.ComponentType<{ className?: string }> } {
	const t = title
	if (/误区|错误|问题/.test(t)) return { gradient: "from-orange-500 to-amber-500", ring: "ring-orange-100", icon: AlertTriangle }
	if (/互动|设问|提问|讨论/.test(t)) return { gradient: "from-purple-500 to-fuchsia-500", ring: "ring-purple-100", icon: MessageCircle }
	if (/时间|安排|节奏|分配/.test(t)) return { gradient: "from-emerald-500 to-teal-500", ring: "ring-emerald-100", icon: Clock }
	if (/核心|知识|要点|重点/.test(t)) return { gradient: "from-[#1677ff] to-[#0958d9]", ring: "ring-blue-100", icon: BookOpen }
	return { gradient: "from-slate-500 to-slate-600", ring: "ring-slate-100", icon: ListOrdered }
}

export function OutlineRenderer({ markdown, audience }: { markdown: string; audience: "worker" | "trainer" }) {
	const sections = useMemo(() => parseMarkdown(markdown || ""), [markdown])
	const [active, setActive] = useState<string>(sections[0]?.id || "")

	useEffect(() => {
		if (!active && sections[0]) setActive(sections[0].id)
	}, [active, sections])

	if (sections.length === 0 || (sections.length === 1 && sections[0].blocks.length === 0)) {
		return <div className="text-sm text-gray-400 p-8 text-center">暂无内容</div>
	}

	return (
		<div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
			{/* 目录 */}
			<nav className="lg:sticky lg:top-20 self-start rounded-xl border border-gray-100 bg-white p-3 max-h-[calc(100vh-6rem)] overflow-auto">
				<div className="text-[11px] text-gray-400 px-2 pb-2 uppercase tracking-wider">目录</div>
				<div className="space-y-0.5">
					{sections.map((s, i) => (
						<a
							key={s.id}
							href={`#${s.id}`}
							onClick={() => setActive(s.id)}
							className={[
								"block px-2 py-1.5 rounded-md text-[13px] transition truncate",
								active === s.id ? "bg-[#eff6ff] text-[#1677ff] font-medium" : "text-gray-600 hover:bg-gray-50 hover:text-gray-800",
							].join(" ")}
						>
							<span className="text-gray-400 mr-1.5 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
							{s.title}
						</a>
					))}
				</div>
			</nav>

			{/* 章节内容 */}
			<div className="space-y-5 min-w-0">
				{sections.map((s, i) => {
					const theme = audience === "trainer" ? trainerTheme(s.title) : { gradient: "from-[#1677ff] to-[#0958d9]", ring: "ring-blue-100", icon: BookOpen }
					const Icon = theme.icon
					return (
						<section key={s.id} id={s.id} className="brand-card rounded-xl overflow-hidden scroll-mt-20">
							<header className={`px-5 py-3 bg-gradient-to-r ${theme.gradient} text-white flex items-center gap-2.5`}>
								<div className={`w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center ring-2 ${theme.ring}`}>
									<Icon className="w-4 h-4" />
								</div>
								<div>
									<div className="text-[11px] text-white/70 uppercase tracking-wider">Chapter {i + 1}</div>
									<div className="text-[15px] font-semibold">{s.title}</div>
								</div>
							</header>
							<div className="px-5 py-4">{s.blocks.map((b, idx) => renderBlock(b, idx, audience))}</div>
						</section>
					)
				})}
			</div>
		</div>
	)
}
