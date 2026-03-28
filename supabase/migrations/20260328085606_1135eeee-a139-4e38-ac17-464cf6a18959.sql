CREATE TYPE public.alert_category AS ENUM (
  'political', 'financial', 'regulatory', 'supply_chain',
  'environmental', 'construction', 'stakeholder', 'market', 'security'
);
ALTER TABLE public.alerts ADD COLUMN category public.alert_category NOT NULL DEFAULT 'market';