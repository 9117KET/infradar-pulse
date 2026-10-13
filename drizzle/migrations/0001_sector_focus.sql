CREATE TABLE public.sector_focus (
  theme text PRIMARY KEY,
  label text NOT NULL,
  weight integer NOT NULL DEFAULT 5 CHECK (weight BETWEEN 0 AND 10),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, UPDATE ON public.sector_focus TO authenticated;
GRANT ALL ON public.sector_focus TO service_role;
ALTER TABLE public.sector_focus ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read sector focus" ON public.sector_focus FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'researcher'));
CREATE POLICY "Admins update sector focus" ON public.sector_focus FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.sector_focus(theme,label,weight) VALUES
 ('ai-compute','AI compute & GPU campuses',10),
 ('ai-power','Power for AI (grid, substations, generation)',9),
 ('dc-cooling','Data-centre cooling & water',6),
 ('semiconductors','Semiconductor fabs & packaging',9),
 ('chip-supply','Chip supply chain (equipment, materials)',7),
 ('battery','Batteries & grid storage',8),
 ('nuclear','Nuclear & SMRs',8),
 ('hydrogen','Hydrogen & ammonia',6),
 ('space','Space & satellite',5),
 ('subsea-digital','Subsea cables & fibre',5),
 ('critical-minerals','Critical minerals processing',6),
 ('defence','Defence industrial',4),
 ('construction','Large building & mixed-use construction',5);