ALTER TABLE public.alerts ADD COLUMN source_url text DEFAULT NULL;
ALTER TABLE public.insights ADD COLUMN source_url text DEFAULT NULL;