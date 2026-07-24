import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { getStorage, presignUrl } from "@/lib/storage";
import { createTask } from "@/lib/task-queue";

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.\-]/g, "_");
}

// GET /api/person-materials?personId=xxx&category=xxx
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const personId = searchParams.get("personId");
  const category = searchParams.get("category");

  if (!personId) {
    return NextResponse.json({ error: "personId is required" }, { status: 400 });
  }

  let query = getSupabaseClient()
    .from("person_materials")
    .select("*")
    .eq("person_id", personId)
    .order("created_at", { ascending: false });

  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Generate presigned URLs for each file
  const items = await Promise.all(
    (data || []).map(async (item: Record<string, unknown>) => {
      let fileUrl = "";
      try {
        fileUrl = await presignUrl(item.file_key as string);
      } catch {
        fileUrl = "";
      }
      return { ...item, file_url: fileUrl };
    })
  );

  return NextResponse.json({ success: true, data: items });
}

// POST /api/person-materials?personId=xxx
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const personId = searchParams.get("personId");

  if (!personId) {
    return NextResponse.json({ error: "personId is required" }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File;
  const category = formData.get("category") as string || "other";

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Validate category
  const validCategories = ["general", "safety_education", "safety_briefing", "other"];
  if (!validCategories.includes(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  // Upload file to storage
  const buffer = Buffer.from(await file.arrayBuffer());
  const safeName = sanitizeFileName(file.name);
  const fileName = `person-materials/${personId}/${Date.now()}_${safeName}`;
  const storage = getStorage();

  let key: string | null = null;
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      key = await storage.uploadFile({
        fileContent: buffer,
        fileName,
        contentType: file.type || "application/octet-stream",
      });
      break;
    } catch (uploadErr) {
      lastError = uploadErr instanceof Error ? uploadErr : new Error(String(uploadErr));
      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  if (!key) {
    return NextResponse.json(
      { error: `文件上传失败: ${lastError?.message || "未知错误"}，请重试` },
      { status: 500 }
    );
  }

  // Insert record into database
  const { data: insertData, error: insertError } = await getSupabaseClient()
    .from("person_materials")
    .insert({
      person_id: personId,
      category,
      file_name: file.name,
      file_type: file.type,
      file_key: key,
      file_size: file.size,
      status: "pending",
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Create background task for parsing
  await createTask({
    type: "parse_person_material",
    resource_type: "person_materials",
    resource_id: insertData.id,
    payload: {
      person_id: personId,
      category,
      file_name: file.name,
      file_key: key,
      file_type: file.type,
    },
  });

  return NextResponse.json({ 
    success: true, 
    data: insertData,
    message: "File uploaded successfully, parsing will start soon" 
  });
}
