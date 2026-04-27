-- BD pipeline tracker: stores partner organizations and deal status
-- for the business development funnel (Prospect → Intro → Demo → Pilot → Closed).

CREATE TABLE IF NOT EXISTS public.bd_partners (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_name      text NOT NULL,
  contact_name  text,
  contact_email text,
  tier          text NOT NULL DEFAULT 'consulting_firm',
    -- 'consulting_firm' | 'investment_bank' | 'dfi' | 'trade_assoc' | 'epc_contractor' | 'other'
  deal_status   text NOT NULL DEFAULT 'prospect',
    -- 'prospect' | 'intro' | 'demo' | 'pilot' | 'closed' | 'lost'
  deal_value_usd numeric,
  notes         text,
  next_action   text,
  next_action_at date,
  referral_code text REFERENCES public.referral_codes(code) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bd_partners ENABLE ROW LEVEL SECURITY;

-- Only admins can read/write BD pipeline data
CREATE POLICY "Admin full access on bd_partners" ON public.bd_partners
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Auto-update updated_at on any change
CREATE OR REPLACE FUNCTION public.touch_bd_partners_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER bd_partners_updated_at
  BEFORE UPDATE ON public.bd_partners
  FOR EACH ROW EXECUTE FUNCTION public.touch_bd_partners_updated_at();
