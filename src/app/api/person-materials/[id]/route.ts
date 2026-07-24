import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// DELETE /api/person-materials/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Get the record first
  const { data: record, error: fetchError } = await getSupabaseClient()
    .from("person_materials")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !record) {
    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }

  // Delete record from database (file in storage can be cleaned up later)
  const { error: deleteError } = await getSupabaseClient()
    .from("person_materials")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "File deleted successfully" });
}
