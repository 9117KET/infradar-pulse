ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS entitlement_plan_key text,
ADD COLUMN IF NOT EXISTS entitlement_plan_until timestamptz;
