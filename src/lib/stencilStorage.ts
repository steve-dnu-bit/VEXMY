import { supabase } from "@/integrations/supabase/client";

export type StencilSession = {
  id: string;
  originalPath: string;
  stencilPath: string;
  originalPublicUrl: string;
  stencilPublicUrl: string;
};

export type RecentStencil = {
  id: string;
  originalUrl: string;
  stencilUrl: string;
  createdAt: string;
};

/**
 * List the current user's stencils generated in the last 24 hours — the window
 * during which generated stencils are retained before the scheduled purge job
 * removes them. Used to populate the "recent stencils" folder so artists can
 * re-open and re-download anything made earlier in the session.
 */
export async function fetchRecentStencils(userId: string): Promise<RecentStencil[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("stencils")
    .select("id, original_image_url, stencil_image_url, created_at")
    .eq("created_by", userId)
    .eq("status", "completed")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data
    .filter((row) => !!row.stencil_image_url)
    .map((row) => ({
      id: row.id,
      originalUrl: row.original_image_url,
      stencilUrl: row.stencil_image_url as string,
      createdAt: row.created_at,
    }));
}

function extFromFile(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && ["jpg", "jpeg", "png", "webp", "gif"].includes(fromName)) return fromName === "jpeg" ? "jpg" : fromName;
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

async function dataUrlToBlob(dataUrl: string) {
  const res = await fetch(dataUrl);
  if (!res.ok) throw new Error("Failed to read generated stencil");
  return res.blob();
}

export async function persistStencilSession(
  userId: string,
  file: File,
  stencilDataUrl: string,
): Promise<StencilSession> {
  const id = crypto.randomUUID();
  const ext = extFromFile(file);
  const originalPath = `stencils/${userId}/${id}/original.${ext}`;
  const stencilPath = `stencils/${userId}/${id}/stencil.png`;

  const { error: originalError } = await supabase.storage.from("uploads").upload(originalPath, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (originalError) throw new Error(originalError.message);

  const stencilBlob = await dataUrlToBlob(stencilDataUrl);
  const { error: stencilError } = await supabase.storage.from("uploads").upload(stencilPath, stencilBlob, {
    upsert: false,
    contentType: "image/png",
  });
  if (stencilError) {
    await supabase.storage.from("uploads").remove([originalPath]);
    throw new Error(stencilError.message);
  }

  const { data: originalUrlData } = supabase.storage.from("uploads").getPublicUrl(originalPath);
  const { data: stencilUrlData } = supabase.storage.from("uploads").getPublicUrl(stencilPath);

  const { error: dbError } = await supabase.from("stencils").insert({
    id,
    created_by: userId,
    original_image_url: originalUrlData.publicUrl,
    stencil_image_url: stencilUrlData.publicUrl,
    status: "completed",
  });

  if (dbError) {
    await supabase.storage.from("uploads").remove([originalPath, stencilPath]);
    throw new Error(dbError.message);
  }

  return {
    id,
    originalPath,
    stencilPath,
    originalPublicUrl: originalUrlData.publicUrl,
    stencilPublicUrl: stencilUrlData.publicUrl,
  };
}

export async function deleteStencilSession(session: StencilSession) {
  await supabase.storage.from("uploads").remove([session.originalPath, session.stencilPath]);
  await supabase.from("stencils").delete().eq("id", session.id);
}

export async function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function downloadStencilAndDelete(session: StencilSession, stencilDataUrl: string) {
  const blob = await dataUrlToBlob(stencilDataUrl);
  await downloadBlob(blob, "stencil.png");
  await deleteStencilSession(session);
}

/**
 * Download the stencil without deleting it. Generated stencils are retained for
 * 24 hours and then removed automatically by the scheduled purge job, so the
 * artist can re-download within that window.
 */
export async function downloadStencilOnly(stencilDataUrl: string) {
  const blob = await dataUrlToBlob(stencilDataUrl);
  await downloadBlob(blob, "stencil.png");
}
