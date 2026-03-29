-- Additive coverage sectors (legacy enum values unchanged).
ALTER TYPE public.project_sector ADD VALUE IF NOT EXISTS 'Infrastructure';
ALTER TYPE public.project_sector ADD VALUE IF NOT EXISTS 'Building Construction';
ALTER TYPE public.project_sector ADD VALUE IF NOT EXISTS 'Industrial';
ALTER TYPE public.project_sector ADD VALUE IF NOT EXISTS 'Chemical';
ALTER TYPE public.project_sector ADD VALUE IF NOT EXISTS 'Oil & Gas';
ALTER TYPE public.project_sector ADD VALUE IF NOT EXISTS 'Mining';
ALTER TYPE public.project_sector ADD VALUE IF NOT EXISTS 'Data Centers';
ALTER TYPE public.project_sector ADD VALUE IF NOT EXISTS 'AI Infrastructure';
