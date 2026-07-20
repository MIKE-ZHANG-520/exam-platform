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

// Generate question bank document
async function generateQuestionBankDoc(
  docx: typeof import("docx"),
  title: string,
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
      children: [new TextRun({ text: title, bold: true, size: 36, font: "Microsoft YaHei" })],
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    })
  )

  // Subtitle
  children.push(
    new Paragraph({
      children: [new TextRun({ text: withAnswer ? "（含答案版）" : "（空白试卷）", color: "666666", size: 24 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
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

  // Get question bank info
  const { data: bank, error: bankError } = await client
    .from("question_banks")
    .select("id, title")
    .eq("id", id)
    .single()

  if (bankError || !bank) {
    return NextResponse.json({ error: "题库不存在" }, { status: 404 })
  }

  // Get questions
  const { data: questions, error: qError } = await client
    .from("questions")
    .select("id, type, content, options, answer, explanation")
    .eq("bank_id", id)
    .order("type")
    .order("created_at")

  if (qError) {
    return NextResponse.json({ error: "获取题目失败" }, { status: 500 })
  }

  if (!questions || questions.length === 0) {
    return NextResponse.json({ error: "题库题目为空" }, { status: 400 })
  }

  // Dynamic import for ESM-only docx library
  const docx = await import("docx")
  const title = bank.title
  const buffer = await generateQuestionBankDoc(docx, title, questions as Question[], withAnswer)

  const fileName = `${bank.title}_${withAnswer ? "含答案" : "空白"}.docx`
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  })
}
