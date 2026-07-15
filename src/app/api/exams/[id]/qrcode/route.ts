import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

// GET /api/exams/:id/qrcode 返回二维码 PNG DataURL 与考试 URL
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const origin = process.env.COZE_PROJECT_DOMAIN_DEFAULT || req.nextUrl.origin;
  const url = `${origin}/exam/${id}`;
  try {
    const dataUrl = await QRCode.toDataURL(url, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 512,
    });
    return NextResponse.json({ url, data_url: dataUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
