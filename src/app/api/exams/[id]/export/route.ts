import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSession } from "@/lib/auth"
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  convertInchesToTwip,
} from "docx"

export const runtime = "nodejs"

const supabaseUrl = process.env.COZE_SUPABASE_URL!
const supabaseKey = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY!
const client = createClient(supabaseUrl, supabaseKey)

interface Question {
  id: string
  type: "single" | "multiple" | "judge"
  content: string
  options: Array<{ key: string; text: string }>
  answer: string[]
  explanation?: string | null
}

const typeNames: Record<string, string> = {
  single: "单选题",
  multiple: "多选题",
  judge: "判断题",
}

function buildQuestionParagraphs(questions: Question[], withAnswer: boolean): Paragraph[] {
  const paragraphs: Paragraph[] = []
  const grouped = {
    single: questions.filter((q) => q.type === "single"),
    multiple: questions.filter((q) => q.type === "multiple"),
    judge: questions.filter((q) => q.type === "judge"),
  }

  let globalIndex = 0

  for (const [type, qs] of Object.entries(grouped)) {
    if (qs.length === 0) continue

    // Section title
    paragraphs.push(
      new Paragraph({
        text: typeNames[type] || type,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400, after: 200 },
      })
    )

    for (const q of qs) {
      globalIndex++

      // Question content
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${globalIndex}. `, bold: true }),
            new TextRun({ text: q.content }),
          ],
          spacing: { before: 200, after: 100 },
        })
      )

      // Options
      for (const opt of q.options) {
        paragraphs.push(
          new Paragraph({
            text: `    ${opt.key}. ${opt.text}`,
            spacing: { after: 40 },
          })
        )
      }

      // Answer and explanation (if withAnswer)
      if (withAnswer) {
        const answerText = q.answer.join(", ")
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({ text: "【答案】", bold: true, color: "2E7D32" }),
              new TextRun({ text: answerText, color: "2E7D32" }),
            ],
            spacing: { before: 80, after: 40 },
          })
        )

        if (q.explanation) {
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({ text: "【解析】", bold: true, color: "1565C0" }),
                new TextRun({ text: q.explanation, color: "1565C0" }),
              ],
              spacing: { after: 100 },
            })
          )
        }

        // Separator line
        paragraphs.push(
          new Paragraph({
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 1, color: "E0E0E0" },
            },
            spacing: { after: 100 },
          })
        )
      } else {
        // Blank space for answer
        paragraphs.push(
          new Paragraph({
            text: "",
            spacing: { after: 150 },
          })
        )
      }
    }
  }

  return paragraphs
}

async function generateDocx(
  title: string,
  questions: Question[],
  withAnswer: boolean,
  examConfig?: { duration?: number; pass_score?: number }
): Promise<Buffer> {
  const children: Paragraph[] = [
    // Title
    new Paragraph({
      text: title,
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    // Subtitle
    new Paragraph({
      text: withAnswer ? "（含答案版）" : "（空白试卷）",
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
  ]

  // Exam info (if available)
  if (examConfig) {
    const infoParts: string[] = []
    if (examConfig.duration) infoParts.push(`考试时长：${examConfig.duration}分钟`)
    if (examConfig.pass_score) infoParts.push(`及格分数：${examConfig.pass_score}分`)
    if (infoParts.length > 0) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: infoParts.join("  |  "), color: "666666" })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        })
      )
    }
  }

  // Info line
  children.push(
    new Paragraph({
      children: [new TextRun({ text: `共 ${questions.length} 题`, color: "666666" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    })
  )

  // Questions
  children.push(...buildQuestionParagraphs(questions, withAnswer))

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

  // Get questions from exam's question banks
  const examConfig = exam.config as { duration?: number; pass_score?: number; bank_ids?: string[] } | null
  const bankIds = examConfig?.bank_ids || []

  let questions: Question[] = []

  if (bankIds.length > 0) {
    // Get questions from linked banks
    const { data: bankQuestions, error: qError } = await client
      .from("questions")
      .select("id, type, content, options, answer, explanation")
      .in("bank_id", bankIds)
      .order("type")
      .order("created_at")

    if (!qError && bankQuestions) {
      questions = bankQuestions as Question[]
    }
  }

  if (questions.length === 0) {
    return NextResponse.json({ error: "试卷题目为空" }, { status: 400 })
  }

  // Generate docx
  const title = exam.title
  const buffer = await generateDocx(title, questions, withAnswer, examConfig ? { duration: examConfig.duration, pass_score: examConfig.pass_score } : undefined)

  // Return as file download
  const fileName = `${exam.title}_${withAnswer ? "含答案" : "空白"}.docx`
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  })
}
