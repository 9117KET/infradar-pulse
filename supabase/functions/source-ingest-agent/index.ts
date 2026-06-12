/**
 * source-ingest-agent
 *
 * Controlled ingestion path for authenticated/premium external sources.
 * - HTML/text: fetched directly and stored.
 * - PDF: bytes fetched, printable text extracted via byte-scan, then cleaned with AI.
 *   Extracted text is stored in raw_sources for downstream agents to process.
 *
 * NOTE: Full browser automation for paywalled sites should NOT run inside Edge Functions.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireStaffOrRespond } from "../_shared/requireStaff.ts";
import { chatCompletions } from "../_shared/llm.ts";
import { isAgentEnabled, pausedResponse } from "../_shared/agentGate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Content-Type": "application/json",
};

const PDF_MAX_BYTES = 4 * 1024 * 1024; // 4 MB limit for PDF text extraction
const MIN_STRING_LENGTH = 4; // Minimum run length for PDF string extraction

function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  return crypto.subtle.digest("SHA-256", data).then((buf) =>
    Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("")
  );
}

/**
 * Extract printable text from raw PDF bytes using a byte-scan approach.
 * Works for text-based PDFs (filings, project documents). Returns empty string
 * for image-only or encrypted PDFs.
 */
function extractPdfText(bytes: Uint8Array): string {
  const strings: string[] = [];
  let current: number[] = [];

  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    // Printable ASCII range (0x20–0x7E) plus tab/newline/CR
    if ((b >= 0x20 && b <= 0x7e) || b === 0x09 || b === 0x0a || b === 0x0d) {
      current.push(b);
    } else {
      if (current.length >= MIN_STRING_LENGTH) {
        strings.push(String.fromCharCode(...current));
      }
      current = [];
    }
  }
  if (current.length >= MIN_STRING_LENGTH) {
    strings.push(String.fromCharCode(...current));
  }

  // Join and deduplicate short/noisy strings
  return strings
    .filter((s) => s.trim().length >= MIN_STRING_LENGTH)
    .join(" ")
    .replace(/\s{3,}/g, "  ") // collapse excessive whitespace
    .trim();
}

/**
 * Use AI to clean and structure raw extracted PDF text into useful content.
 * Returns the cleaned text, or the original if AI fails.
 */
async function cleanPdfTextWithAI(rawText: string, url: string): Promise<string> {
  // Truncate to a reasonable context window
  const truncated = rawText.slice(0, 12_000);

  const aiRes = await chatCompletions({
    messages: [
      {
        role: "system",
        content: `You are an infrastructure document parser. Given raw text extracted from a PDF (often messy with OCR artifacts), extract and return a clean, readable version of the document content. Focus on: project names, values, locations, timelines, contractor names, and funding details. Remove PDF artefacts, encoding noise, and page headers/footers. Return clean prose, preserving important numbers and proper nouns.`,
      },
      {
        role: "user",
        content: `Clean this raw PDF text from: ${url}\n\n${truncated}`,
      },
    ],
  });

  if (!aiRes.ok) return rawText;

  try {
    const data = await aiRes.json();
    return data.choices?.[0]?.message?.content ?? rawText;
  } catch {
    return rawText;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gate = await requireStaffOrRespond(req);
  if (gate instanceof Response) return gate;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  if (!await isAgentEnabled(supabase, "source-ingest")) return pausedResponse("source-ingest");

  try {
    const body = await req.json().catch(() => ({}));
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    const sourceKey = typeof body?.source_key === "string" ? body.source_key.trim() : "";
    if (!url || !url.startsWith("http")) {
      return new Response(JSON.stringify({ error: "url is required" }), { status: 400, headers: corsHeaders });
    }

    const cookie = Deno.env.get("SOURCE_SESSION_COOKIE") ?? "";
    const userAgent = Deno.env.get("INGEST_USER_AGENT") ?? "InfraRadarIngest/1.0";

    const { data: task, error: taskErr } = await supabase
      .from("research_tasks")
      .insert({
        task_type: "source-ingest",
        query: url,
        status: "running",
        requested_by: gate.userId,
        result: { step: "fetching" },
      })
      .select("id")
      .single();
    if (taskErr) throw new Error(`Failed to create task: ${taskErr.message}`);
    const taskId = task.id as string;

    const res = await fetch(url, {
      headers: {
        "User-Agent": userAgent,
        ...(cookie ? { Cookie: cookie } : {}),
        Accept: "text/html,application/pdf,application/json;q=0.9,*/*;q=0.8",
      },
    });

    const contentType = res.headers.get("content-type") ?? "";
    const isPdf = contentType.includes("pdf") || url.toLowerCase().endsWith(".pdf");
    const isTexty = !isPdf && (contentType.includes("text/") || contentType.includes("json") || contentType.includes("xml") || contentType.includes("html"));

    let contentText = "";
    let extractionMethod = "none";

    if (isTexty) {
      contentText = await res.text();
      extractionMethod = "text";
    } else if (isPdf) {
      // Check content-length header to avoid reading huge PDFs
      const contentLength = parseInt(res.headers.get("content-length") ?? "0", 10);
      if (contentLength > 0 && contentLength > PDF_MAX_BYTES) {
        contentText = `[PDF too large for extraction: ${Math.round(contentLength / 1024)}KB > ${PDF_MAX_BYTES / 1024}KB limit]`;
        extractionMethod = "skipped-too-large";
      } else {
        await supabase.from("research_tasks").update({ result: { step: "extracting-pdf" } }).eq("id", taskId);

        // Read PDF bytes (with size guard)
        const buffer = await res.arrayBuffer();
        if (buffer.byteLength > PDF_MAX_BYTES) {
          contentText = `[PDF too large for extraction: ${Math.round(buffer.byteLength / 1024)}KB]`;
          extractionMethod = "skipped-too-large";
        } else {
          const bytes = new Uint8Array(buffer);
          const rawExtracted = extractPdfText(bytes);

          if (rawExtracted.length < 100) {
            // Image-only or encrypted PDF — no extractable text
            contentText = `[Image-only or encrypted PDF — no extractable text. URL: ${url}]`;
            extractionMethod = "image-only";
          } else {
            await supabase.from("research_tasks").update({ result: { step: "cleaning-pdf-text" } }).eq("id", taskId);
            contentText = await cleanPdfTextWithAI(rawExtracted, url);
            extractionMethod = "pdf-ai-extracted";
          }
        }
      }
    } else {
      // Binary non-PDF: store metadata only
      contentText = `[Binary content: ${contentType}]`;
      extractionMethod = "binary-skipped";
    }

    const hash = await sha256Hex(`${url}\n${contentText}`);

    const { error: insErr } = await supabase.from("raw_sources").insert({
      source_key: sourceKey,
      url,
      title: "",
      source_type: isPdf ? "pdf" : "html",
      content_text: contentText.slice(0, 200_000),
      content_hash: hash,
      metadata: {
        status: res.status,
        content_type: contentType,
        fetched_ok: res.ok,
        extraction_method: extractionMethod,
        extracted_chars: contentText.length,
      },
    });
    if (insErr) throw new Error(`Failed to insert raw_sources: ${insErr.message}`);

    await supabase
      .from("research_tasks")
      .update({
        status: "completed",
        result: {
          step: "completed",
          url,
          fetched_ok: res.ok,
          status: res.status,
          content_type: contentType,
          extraction_method: extractionMethod,
          extracted_chars: contentText.length,
        },
        completed_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    return new Response(
      JSON.stringify({ success: true, taskId, url, status: res.status, contentType, extractionMethod, extractedChars: contentText.length }),
      { headers: corsHeaders },
    );
  } catch (e) {
    console.error("source-ingest-agent error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: corsHeaders });
  }
});
