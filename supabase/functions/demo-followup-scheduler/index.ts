/**
 * demo-followup-scheduler
 *
 * Runs daily (via Supabase cron or external trigger). For every demo_request
 * subscriber, sends:
 *   Step 1 (day 3): Research Hub teaser
 *   Step 2 (day 7): Breakup / free-tier CTA
 *
 * Marks each subscriber's follow_up_step after sending so it never re-sends.
 * Respects the email suppression list via send-transactional-email.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { isAgentEnabled, pausedResponse } from '../_shared/agentGate.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  // Agent gate — pause/resume from AgentMonitoring dashboard
  if (!await isAgentEnabled(supabase, 'demo_followup')) {
    return pausedResponse()
  }

  const now = new Date()
  const sent: string[] = []
  const errors: string[] = []

  // --- Step 1: subscribers who signed up 3+ days ago and haven't had step 1 yet ---
  const day3Cutoff = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const { data: step1Rows, error: e1 } = await supabase
    .from('subscribers')
    .select('id, email, name, preferences')
    .eq('type', 'demo_request')
    .eq('follow_up_step', 0)
    .lt('created_at', day3Cutoff)
    .limit(50)

  if (e1) {
    console.error('[demo-followup] step1 query error', e1)
  } else {
    for (const row of (step1Rows ?? [])) {
      const prefs = (row.preferences as Record<string, string> | null) ?? {}
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            templateName: 'demo-followup',
            recipientEmail: row.email,
            templateData: {
              name: row.name ?? undefined,
              step: 1,
              sector: prefs.sector ?? undefined,
              region: prefs.region ?? undefined,
            },
          }),
        })
        if (res.ok) {
          await supabase
            .from('subscribers')
            .update({ follow_up_step: 1, follow_up_sent_at: now.toISOString() })
            .eq('id', row.id)
          sent.push(`step1:${row.email}`)
        } else {
          const body = await res.text()
          errors.push(`step1:${row.email}: ${res.status} ${body}`)
        }
      } catch (err) {
        errors.push(`step1:${row.email}: ${String(err)}`)
      }
    }
  }

  // --- Step 2: subscribers who got step 1 and it's been 4+ more days (7 total) ---
  const day7Cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: step2Rows, error: e2 } = await supabase
    .from('subscribers')
    .select('id, email, name, preferences')
    .eq('type', 'demo_request')
    .eq('follow_up_step', 1)
    .lt('created_at', day7Cutoff)
    .limit(50)

  if (e2) {
    console.error('[demo-followup] step2 query error', e2)
  } else {
    for (const row of (step2Rows ?? [])) {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            templateName: 'demo-followup',
            recipientEmail: row.email,
            templateData: {
              name: row.name ?? undefined,
              step: 2,
            },
          }),
        })
        if (res.ok) {
          await supabase
            .from('subscribers')
            .update({ follow_up_step: 2, follow_up_sent_at: now.toISOString() })
            .eq('id', row.id)
          sent.push(`step2:${row.email}`)
        } else {
          const body = await res.text()
          errors.push(`step2:${row.email}: ${res.status} ${body}`)
        }
      } catch (err) {
        errors.push(`step2:${row.email}: ${String(err)}`)
      }
    }
  }

  console.log('[demo-followup] done', { sent: sent.length, errors: errors.length })
  return new Response(JSON.stringify({ sent, errors }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
