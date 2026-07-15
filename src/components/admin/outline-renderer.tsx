"use client"

import { useEffect, useMemo, useState } from "react"
import {
	CheckCircle2, AlertTriangle, XCircle, Sparkles, ListOrdered,
	Clock, Lightbulb, MessageCircle, BookOpen, Palette, HelpCircle,
	Users, Volume2, Flame, Zap,
} from "lucide-react"

type OutlineBlock =
	| { kind: "heading"; level: 2 | 3; text: string; id: string }
	| { kind: "para"; text: string }
	| { kind: "callout"; tag: "success" | "warn" | "danger" | "tip" | "quote" | "info"; text: string }
	| { kind: "list"; items: string[]; ordered: boolean; startIdx?: number }
	| { kind: "quote"; text: string }
	| { kind: "story"; text: string }
	| { kind: "formula"; text: string }
	| { kind: "case"; text: string }
	| { kind: "image"; text: string }
	| { kind: "quiz"; text: string }
	| { kind: "icebreak"; text: string }
	| { kind: "roleplay"; text: string }
	| { kind: "discuss"; text: string }
	| { kind: "script"; text: string }
	| { kind: "time"; text: string }

interface Section {
	id: string
	title: string
	blocks: OutlineBlock[]
}

function slug(s: string, idx: number): string {
	return `sec-${idx}-` + s.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 24).replace(/^-|-$/g, "").toLowerCase()
}

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

	const listBuf: string[] = []
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
			const special = detectSpecial(item)
			const callout = detectCallout(item)
			if (special) {
				flushList()
				current.blocks.push(special)
			} else if (callout) {
				flushList()
				current.blocks.push(callout)
			} else {
				listOrdered = false
				listBuf.push(item)
			}
			continue
		}

		// 独立行的特殊标记
		const special = detectSpecial(line)
		if (special) {
			flushList()
			current.blocks.push(special)
			continue
		}
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

/** Detect V3 special block types: story, formula, case, image, quiz, icebreak, roleplay, discuss, script, time */
function detectSpecial(text: string): OutlineBlock | null {
	const t = text.trim()
	// 📖案例 / 案例：
	if (/^📖|案例[:：]/.test(t)) return { kind: "case", text: t.replace(/^📖\s*/, "").replace(/^案例[:：]\s*/, "") }
	// 🎨配图 / 配图建议：
	if (/^🎨|配图[:：]/.test(t)) return { kind: "image", text: t.replace(/^🎨\s*/, "").replace(/^配图[建议]?[:：]\s*/, "") }
	// ❓考考你 / 互动提问 / 思考题：
	if (/^❓|考考你[:：]|思考题[:：]|互动提问[:：]/.test(t)) return { kind: "quiz", text: t.replace(/^❓\s*/, "").replace(/^(考考你|思考题|互动提问)[:：]\s*/, "") }
	// 🧊破冰 / 破冰游戏：
	if (/^🧊|破冰[:：]/.test(t)) return { kind: "icebreak", text: t.replace(/^🧊\s*/, "").replace(/^破冰[游戏]?[:：]\s*/, "") }
	// 🎭角色扮演 / 情景模拟：
	if (/^🎭|角色扮演[:：]|情景模拟[:：]/.test(t)) return { kind: "roleplay", text: t.replace(/^🎭\s*/, "").replace(/^(角色扮演|情景模拟)[:：]\s*/, "") }
	// 💬讨论 / 分组讨论：
	if (/^💬|讨论[:：]|分组讨论[:：]/.test(t)) return { kind: "discuss", text: t.replace(/^💬\s*/, "").replace(/^(讨论|分组讨论)[:：]\s*/, "") }
	// 🗣️话术 / 互动话术 / 培训师话术：
	if (/^🗣️|话术[:：]|互动话术[:：]|培训师话术[:：]/.test(t)) return { kind: "script", text: t.replace(/^🗣️\s*/, "").replace(/^(话术|互动话术|培训师话术)[:：]\s*/, "") }
	// ⏱️时间 / 时间分配：
	if (/^⏱️|时间[:：]|时间分配[:：]/.test(t)) return { kind: "time", text: t.replace(/^⏱️\s*/, "").replace(/^(时间[分配]?|用时)[:：]\s*/, "") }
	// 📝故事 / 故事开场 / 工地小故事：
	if (/^📝|故事[:：]|工地小故事[:：]/.test(t)) return { kind: "story", text: t.replace(/^📝\s*/, "").replace(/^(故事|工地小故事|故事开场)[:：]\s*/, "") }
	// 🎯口诀 / 顺口溜：
	if (/^🎯|顺口溜[:：]/.test(t)) return { kind: "formula", text: t.replace(/^🎯\s*/, "").replace(/^顺口溜[:：]\s*/, "") }
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
			<div className="my-2 p-3 pl-4 border-l-4 border-yellow-400 bg-yellow-50 rounded-r-md flex gap-2 items-start">
				<Icon className="w-4 h-4 mt-0.5 shrink-0 text-yellow-700" />
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

function StoryBox({ text }: { text: string }) {
	return (
		<div className="outline-story-box my-2">
			<div className="flex items-center gap-1.5 mb-1 text-[11px] font-semibold text-blue-600">
				<BookOpen className="w-3.5 h-3.5" />
				<span>工地故事</span>
			</div>
			{inline(text)}
		</div>
	)
}

function FormulaBox({ text }: { text: string }) {
	return (
		<div className="outline-formula-box my-2 pl-6">
			<div className="flex items-center gap-1.5 mb-0.5 text-[11px] font-semibold text-amber-600">
				<Sparkles className="w-3.5 h-3.5" />
				<span>保命口诀</span>
			</div>
			{inline(text)}
		</div>
	)
}

function CaseBox({ text }: { text: string }) {
	return (
		<div className="outline-case-box my-2 mt-3">
			<span className="outline-case-tag flex items-center gap-1">
				<BookOpen className="w-2.5 h-2.5" />
				案例
			</span>
			<div className="pt-1">{inline(text)}</div>
		</div>
	)
}

function ImageBox({ text }: { text: string }) {
	return (
		<div className="outline-image-box my-2">
			<Palette className="w-4 h-4 shrink-0 mt-0.5 text-indigo-400" />
			<div className="flex-1">
				<div className="text-[11px] font-semibold text-indigo-500 mb-0.5">配图建议</div>
				{inline(text)}
			</div>
		</div>
	)
}

function QuizBox({ text }: { text: string }) {
	return (
		<div className="outline-quiz-box my-2">
			<div className="flex items-center gap-1.5 mb-1 text-[11px] font-semibold text-purple-600">
				<HelpCircle className="w-3.5 h-3.5" />
				<span>考考你</span>
			</div>
			{inline(text)}
		</div>
	)
}

function IcebreakBox({ text }: { text: string }) {
	return (
		<div className="outline-icebreak-box my-2">
			<div className="flex items-center gap-1.5 mb-1 text-[11px] font-semibold text-emerald-600">
				<Zap className="w-3.5 h-3.5" />
				<span>破冰互动</span>
			</div>
			{inline(text)}
		</div>
	)
}

function RoleplayBox({ text }: { text: string }) {
	return (
		<div className="outline-roleplay-box my-2">
			<div className="flex items-center gap-1.5 mb-1 text-[11px] font-semibold text-orange-600">
				<Users className="w-3.5 h-3.5" />
				<span>角色扮演</span>
			</div>
			{inline(text)}
		</div>
	)
}

function DiscussBox({ text }: { text: string }) {
	return (
		<div className="outline-discuss-box my-2">
			<div className="flex items-center gap-1.5 mb-1 text-[11px] font-semibold text-sky-600">
				<MessageCircle className="w-3.5 h-3.5" />
				<span>分组讨论</span>
			</div>
			{inline(text)}
		</div>
	)
}

function ScriptBox({ text }: { text: string }) {
	return (
		<div className="outline-script-box my-2">
			<div className="flex items-center gap-1.5 mb-0.5 text-[11px] font-semibold text-purple-500">
				<Volume2 className="w-3 h-3" />
				<span>互动话术</span>
			</div>
			{inline(text)}
		</div>
	)
}

function TimeBox({ text }: { text: string }) {
	return (
		<div className="outline-time-box my-2">
			<Clock className="w-3.5 h-3.5 text-emerald-500" />
			{inline(text)}
		</div>
	)
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
	if (b.kind === "story") return <StoryBox key={idx} text={b.text} />
	if (b.kind === "formula") return <FormulaBox key={idx} text={b.text} />
	if (b.kind === "case") return <CaseBox key={idx} text={b.text} />
	if (b.kind === "image") return <ImageBox key={idx} text={b.text} />
	if (b.kind === "quiz") return <QuizBox key={idx} text={b.text} />
	if (b.kind === "icebreak") return <IcebreakBox key={idx} text={b.text} />
	if (b.kind === "roleplay") return <RoleplayBox key={idx} text={b.text} />
	if (b.kind === "discuss") return <DiscussBox key={idx} text={b.text} />
	if (b.kind === "script") return <ScriptBox key={idx} text={b.text} />
	if (b.kind === "time") return <TimeBox key={idx} text={b.text} />
	if (b.kind === "list") {
		if (b.ordered) {
			return (
				<ol key={idx} className="my-2 space-y-2">
					{b.items.map((it, i) => (
						<li key={i} className="flex gap-2.5 items-start">
							<NumberBullet n={(b.startIdx || 1) + i} />
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

function trainerTheme(title: string): { gradient: string; ring: string; icon: React.ComponentType<{ className?: string }> } {
	const t = title
	if (/误区|错误|问题/.test(t)) return { gradient: "from-orange-500 to-amber-500", ring: "ring-orange-100", icon: AlertTriangle }
	if (/互动|设问|提问|讨论/.test(t)) return { gradient: "from-purple-500 to-fuchsia-500", ring: "ring-purple-100", icon: MessageCircle }
	if (/时间|安排|节奏|分配/.test(t)) return { gradient: "from-emerald-500 to-teal-500", ring: "ring-emerald-100", icon: Clock }
	if (/核心|知识|要点|重点/.test(t)) return { gradient: "from-[#1677ff] to-[#0958d9]", ring: "ring-blue-100", icon: BookOpen }
	if (/案例|事故|警示/.test(t)) return { gradient: "from-red-500 to-rose-500", ring: "ring-red-100", icon: Flame }
	return { gradient: "from-slate-500 to-slate-600", ring: "ring-slate-100", icon: ListOrdered }
}

export function OutlineRenderer({ markdown, audience }: { markdown: string; audience: "worker" | "trainer" }) {
	const sections = useMemo(() => parseMarkdown(markdown || ""), [markdown])
	const [active, setActive] = useState<string>(sections[0]?.id || "")

	useEffect(() => {
		if (!active && sections[0]) setActive(sections[0].id)
	}, [active, sections])

	if (sections.length === 0 || (sections.length === 1 && sections[0].blocks.length === 0)) {
		return (
			<div className="flex flex-col items-center justify-center py-16 text-gray-400">
				<BookOpen className="w-12 h-12 mb-3 opacity-30" />
				<p className="text-sm">暂无提纲内容</p>
			</div>
		)
	}

	return (
		<div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
			{/* 目录 */}
			<nav className="lg:sticky lg:top-20 self-start rounded-xl border border-gray-100 bg-white p-3 max-h-[calc(100vh-6rem)] overflow-auto shadow-sm">
				<div className="text-[11px] text-gray-400 px-2 pb-2 uppercase tracking-wider flex items-center gap-1">
					<ListOrdered className="w-3 h-3" />
					目录
				</div>
				<div className="space-y-0.5">
					{sections.map((s, i) => (
						<a
							key={s.id}
							href={`#${s.id}`}
							onClick={() => setActive(s.id)}
							className={[
								"block px-2 py-1.5 rounded-md text-[13px] transition truncate",
								active === s.id ? "bg-[#eff6ff] text-[#1677ff] font-medium border-l-2 border-[#1677ff] pl-2.5" : "text-gray-600 hover:bg-gray-50 hover:text-gray-800",
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
						<section key={s.id} id={s.id} className="outline-chapter scroll-mt-20">
							<header className="outline-chapter-header">
								<div className={`w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center ring-2 ${theme.ring}`}>
									<Icon className="w-4 h-4" />
								</div>
								<div>
									<div className="text-[11px] text-white/70 uppercase tracking-wider">Chapter {i + 1}</div>
									<div className="text-[15px] font-semibold">{s.title}</div>
								</div>
							</header>
							<div className="outline-chapter-body">{s.blocks.map((b, idx) => renderBlock(b, idx, audience))}</div>
						</section>
					)
				})}
			</div>
		</div>
	)
}
