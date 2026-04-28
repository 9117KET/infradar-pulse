import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAiEntitlementOrRespond } from "../_shared/requireAi.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type ChatMessage = { role: "user" | "assistant"; content: string };

function safeMessages(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((m): m is ChatMessage =>
      !!m &&
      typeof m === "object" &&
      ((m as ChatMessage).role === "user" || (m as ChatMessage).role === "assistant") &&
      typeof (m as ChatMessage).content === "string" &&
      (m as ChatMessage).content.trim().length > 0
    )
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 2000) }));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gate = await requireAiEntitlementOrRespond(req);
  if (gate instanceof Response) return gate;

  try {
    const body = await req.json().catch(() => ({}));
    const messages = safeMessages(body?.messages);
    const latest = messages[messages.length - 1];
    if (!latest || latest.role !== "user" || latest.content.length < 3) {
      return new Response(JSON.stringify({ error: "Ask a portfolio question with at least 3 characters." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: tracked, error: trackedError } = await supabase
      .from("tracked_projects")
      .select("project_id, notes, created_at")
      .eq("user_id", gate.userId)
      .order("created_at", { ascending: false });

    if (trackedError) throw trackedError;
    const projectIds = [...new Set((tracked ?? []).map((t) => t.project_id).filter(Boolean))];

    if (projectIds.length === 0) {
      return new Response(JSON.stringify({
        answer:
          "You do not have any tracked projects yet. Add projects to **My Portfolio** first, then I can summarize exposure, risk, stage concentration, updates, and next actions across your watchlist.",
        portfolioCount: 0,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const [{ data: projects }, { data: updates }, { data: contacts }, { data: evidence }] = await Promise.all([
      supabase
        .from("projects")
        .select("id, name, country, region, sector, stage, status, value_usd, value_label, confidence, risk_score, description, timeline, last_updated, source_url")
        .in("id", projectIds)
        .eq("approved", true),
      supabase
        .from("project_updates")
        .select("project_id, field_changed, old_value, new_value, source, created_at")
        .in("project_id", projectIds)
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .from("project_contacts")
        .select("project_id, name, role, organization, email, phone, contact_type, verified, source_url")
        .in("project_id", projectIds)
        .limit(80),
      supabase
        .from("evidence_sources")
        .select("project_id, title, source, url, type, verified, date")
        .in("project_id", projectIds)
        .limit(80),
    ]);

    const notesByProject = Object.fromEntries((tracked ?? []).map((t) => [t.project_id, t.notes ?? ""]));
    const portfolio = (projects ?? []).map((p) => ({
      ...p,
      user_notes: notesByProject[p.id] ?? "",
      recent_updates: (updates ?? []).filter((u) => u.project_id === p.id).slice(0, 5),
      contacts: (contacts ?? []).filter((c) => c.project_id === p.id).slice(0, 8),
      evidence: (evidence ?? []).filter((e) => e.project_id === p.id).slice(0, 8),
    }));

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("AI gateway not configured");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You are InfradarAI's portfolio intelligence analyst. Answer only from the provided tracked-project portfolio context. Be concise, specific, and commercially useful. Use markdown. When helpful, include ranked bullets, risk signals, concentration notes, and recommended next actions. If data is missing, say what is missing and suggest what to track next. Do not claim live web browsing.",
          },
          {
            role: "user",
            content: `Tracked portfolio context as JSON:\n${JSON.stringify(portfolio).slice(0, 50000)}`,
          },
          ...messages,
        ],
        temperature: 0.25,
      }),
    });

    if (aiResp.status === 429) {
      return new Response(JSON.stringify({ error: "AI is rate limited. Please try again in a moment." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiResp.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits are exhausted for this workspace." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiResp.ok) {
      const text = await aiResp.text();
      console.error("portfolio-chat AI error", aiResp.status, text.slice(0, 500));
      return new Response(JSON.stringify({ error: "AI response failed. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResp.json();
    const answer = data?.choices?.[0]?.message?.content;
    if (typeof answer !== "string" || !answer.trim()) throw new Error("AI returned an empty answer");

    return new Response(JSON.stringify({ answer, portfolioCount: portfolio.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("portfolio-chat error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Portfolio chat failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});