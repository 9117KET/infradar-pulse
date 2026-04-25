ALTER TABLE public.subscriptions
DROP CONSTRAINT IF EXISTS subscriptions_paddle_subscription_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_paddle_subscription_env_unique
ON public.subscriptions(paddle_subscription_id, environment);
