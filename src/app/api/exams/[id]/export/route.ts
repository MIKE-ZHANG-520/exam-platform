import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

const supabaseUrl = process.env.COZE_SUPABASE_URL!
const supabaseKey = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY!
const client = createClient(supabaseUrl, supabaseKey)

interface Question {
  id: string
  type: string
  content: string
  options: Record<string, string> | null
  answer: string[]
  explanation: string | null
}

// Generate exam document
async function generateExamDoc(
  docx: typeof import("docx"),
  exam: { title: string; config: { duration?: number; pass_score?: number } | null },
  questions: Question[],
  withAnswer: boolean
) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, convertInchesToTwip } = docx

  const typeNames: Record<string, string> = {
    single: "单选题",
    multiple: "多选题",
    judge: "判断题",
  }

  // Group questions by type
  const grouped: Record<string, Question[]> = {}
  for (const q of questions) {
    if (!grouped[q.type]) grouped[q.type] = []
    grouped[q.type].push(q)
  }

  const children: any[] = []

  // Title
  children.push(
    new Paragraph({
      children: [new TextRun({ text: exam.title, bold: true, size: 40, font: "Microsoft YaHei" })],
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    })
  )

  // Exam info
  const infoParts: string[] = []
  if (exam.config?.duration) infoParts.push(`考试时长：${exam.config.duration}分钟`)
  if (exam.config?.pass_score) infoParts.push(`及格分数：${exam.config.pass_score}分`)
  infoParts.push(`题目数量：${questions.length}题`)

  children.push(
    new Paragraph({
      children: [new TextRun({ text: infoParts.join("  |  "), color: "666666", size: 22 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  )

  // Candidate info section
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: "姓名：__________    手机号：__________    班组：__________" }),
      ],
      spacing: { before: 200, after: 400 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
      },
    })
  )

  // Questions by type
  let globalIndex = 0
  for (const [type, typeQuestions] of Object.entries(grouped)) {
    if (typeQuestions.length === 0) continue

    // Type heading
    children.push(
      new Paragraph({
        children: [new TextRun({ text: typeNames[type] || type, bold: true, size: 28, font: "Microsoft YaHei" })],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      })
    )

    for (const q of typeQuestions) {
      globalIndex++

      // Question content
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${globalIndex}. `, bold: true }),
            new TextRun({ text: q.content }),
          ],
          spacing: { before: 200, after: 100 },
        })
      )

      // Options
      if (q.options && q.type !== "judge") {
        const options = q.options
        for (const [key, value] of Object.entries(options)) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: `    ${key}. ${value}` })],
              spacing: { after: 50 },
            })
          )
        }
      }

      // Answer and explanation (if withAnswer)
      if (withAnswer) {
        const answerText = q.answer.join(", ")
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: "【答案】", bold: true, color: "2E7D32" }),
              new TextRun({ text: answerText, color: "2E7D32" }),
            ],
            spacing: { before: 100, after: 50 },
          })
        )

        if (q.explanation) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: "【解析】", bold: true, color: "1565C0" }),
                new TextRun({ text: q.explanation, color: "1565C0" }),
              ],
              spacing: { after: 100 },
            })
          )
        }

        // Separator
        children.push(
          new Paragraph({
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
            },
            spacing: { after: 100 },
          })
        )
      } else {
        // Space for blank version
        children.push(
          new Paragraph({
            text: "",
            spacing: { after: 150 },
          })
        )
      }
    }
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: "SimSun", size: 24 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1.2),
              right: convertInchesToTwip(1.2),
            },
          },
        },
        children,
      },
    ],
  })

  const buffer = await Packer.toBuffer(doc)
  return Buffer.from(buffer)
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 })

  const { id } = await params
  const { searchParams } = new URL(request.url)
  const withAnswer = searchParams.get("answer") !== "false"

  // Get exam info
  const { data: exam, error: examError } = await client
    .from("exams")
    .select("id, title, config")
    .eq("id", id)
    .single()

  if (examError || !exam) {
    return NextResponse.json({ error: "试卷不存在" }, { status: 404 })
  }

  // Get questions from exam config
  const config = exam.config as { bank_ids?: string[]; questions_per_type?: Record<string, number> } | null
  const bankIds = config?.bank_ids || []

  if (bankIds.length === 0) {
    return NextResponse.json({ error: "试卷未配置题库" }, { status: 400 })
  }

  // Get questions from banks
  const { data: questions, error: qError } = await client
    .from("questions")
    .select("id, type, content, options, answer, explanation")
    .in("bank_id", bankIds)
    .order("type")
    .order("created_at")

  if (qError) {
    return NextResponse.json({ error: "获取题目失败" }, { status: 500 })
  }

  if (!questions || questions.length === 0) {
    return NextResponse.json({ error: "试卷题目为空" }, { status: 400 })
  }

  // Dynamic import for ESM-only docx library
  const docx = await import("docx")
  const buffer = await generateExamDoc(docx, exam as { title: string; config: { duration?: number; pass_score?: number } | null }, questions as Question[], withAnswer)

  const fileName = `${exam.title}_${withAnswer ? "含答案" : "空白"}.docx`
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  })
}
