import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_TYPES = [
	"application/pdf",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation",
	"text/markdown",
	"text/plain",
];

const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".xlsx", ".pptx", ".md", ".txt"];
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

const VALID_CATEGORIES = ["general", "safety_education", "safety_briefing", "other"];

// GET /api/person-materials?person_id=xxx&category=xxx
export async function GET(request: NextRequest) {
	const session = await getSession();
	if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

	const { searchParams } = new URL(request.url);
	const personId = searchParams.get("person_id");
	const category = searchParams.get("category");

	if (!personId) {
		return NextResponse.json({ error: "person_id is required" }, { status: 400 });
	}

	let query = getSupabaseClient()
		.from("person_materials")
		.select("*")
		.eq("person_id", personId)
		.order("created_at", { ascending: false });

	if (category && VALID_CATEGORIES.includes(category)) {
		query = query.eq("category", category);
	}

	const { data, error } = await query;
	if (error) {
		console.error("Query person_materials error:", error);
		return NextResponse.json({ error: error.message }, { status: 500 });
	}

	return NextResponse.json({ success: true, data: data || [] });
}

// POST /api/person-materials - 上传人员资料
export async function POST(request: NextRequest) {
	const session = await getSession();
	if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

	try {
		const formData = await request.formData();
		const files = formData.getAll("files") as File[];
		const personId = formData.get("person_id") as string;
		const category = formData.get("category") as string;

		if (!personId) {
			return NextResponse.json({ error: "person_id is required" }, { status: 400 });
		}

		if (!category || !VALID_CATEGORIES.includes(category)) {
			return NextResponse.json({ 
				error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}` 
			}, { status: 400 });
		}

		if (!files || files.length === 0) {
			return NextResponse.json({ error: "No files provided" }, { status: 400 });
		}

		// Validate files
		for (const file of files) {
			if (!ALLOWED_TYPES.includes(file.type)) {
				const ext = "." + file.name.split(".").pop()?.toLowerCase();
				if (!ALLOWED_EXTENSIONS.includes(ext)) {
					return NextResponse.json({ 
						error: `不支持的文件类型: ${file.name}。仅支持 PDF/Word/Excel/PPT/Markdown/TXT` 
					}, { status: 400 });
				}
			}
			if (file.size > MAX_SIZE) {
				return NextResponse.json({ 
					error: `文件 ${file.name} 超过 20MB 限制` 
				}, { status: 400 });
			}
		}

		const results: Array<{
			id: string;
			file_name: string;
			file_key: string;
			status: string;
		}> = [];

		// Upload each file
		for (const file of files) {
			const ext = "." + file.name.split(".").pop()?.toLowerCase();
			const fileKey = `person-materials/${personId}/${category}/${randomUUID()}${ext}`;
			const buffer = Buffer.from(await file.arrayBuffer());

			// Upload to Supabase Storage
			const { error: uploadError } = await getSupabaseClient().storage
				.from("training-materials")
				.upload(fileKey, buffer, {
					contentType: file.type,
					upsert: false,
				});

			if (uploadError) {
				console.error("Storage upload error:", uploadError);
				return NextResponse.json({ 
					error: `上传文件 ${file.name} 失败: ${uploadError.message}` 
				}, { status: 500 });
			}

			// Insert record
			const { data: record, error: insertError } = await getSupabaseClient()
				.from("person_materials")
				.insert({
					id: randomUUID(),
					person_id: personId,
					category,
					file_name: file.name,
					file_type: ext.slice(1),
					file_key: fileKey,
					file_size: file.size,
					status: "pending",
				})
				.select()
				.single();

			if (insertError) {
				console.error("Insert error:", insertError);
				return NextResponse.json({ 
					error: `保存记录失败: ${insertError.message}` 
				}, { status: 500 });
			}

			results.push({
				id: record.id,
				file_name: record.file_name,
				file_key: record.file_key,
				status: record.status,
			});
		}

		return NextResponse.json({ 
			success: true, 
			data: results,
			message: `成功上传 ${results.length} 个文件` 
		});
	} catch (error) {
		console.error("Upload error:", error);
		return NextResponse.json({ 
			error: error instanceof Error ? error.message : "上传失败" 
		}, { status: 500 });
	}
}

// DELETE /api/person-materials - 删除人员资料
export async function DELETE(request: NextRequest) {
	const session = await getSession();
	if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

	// Only admin can delete
	if (session.role !== "admin") {
		return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
	}

	try {
		const { searchParams } = new URL(request.url);
		const id = searchParams.get("id");

		if (!id) {
			return NextResponse.json({ error: "id is required" }, { status: 400 });
		}

		// Get the record to delete the file
		const { data: record, error: queryError } = await getSupabaseClient()
			.from("person_materials")
			.select("file_key")
			.eq("id", id)
			.single();

		if (queryError || !record) {
			return NextResponse.json({ error: "记录不存在" }, { status: 404 });
		}

		// Delete from storage
		await getSupabaseClient().storage.from("training-materials").remove([record.file_key]);

		// Delete from database
		const { error: deleteError } = await getSupabaseClient()
			.from("person_materials")
			.delete()
			.eq("id", id);

		if (deleteError) {
			console.error("Delete error:", deleteError);
			return NextResponse.json({ error: deleteError.message }, { status: 500 });
		}

		return NextResponse.json({ success: true, message: "删除成功" });
	} catch (error) {
		console.error("Delete error:", error);
		return NextResponse.json({ 
			error: error instanceof Error ? error.message : "删除失败" 
		}, { status: 500 });
	}
}
