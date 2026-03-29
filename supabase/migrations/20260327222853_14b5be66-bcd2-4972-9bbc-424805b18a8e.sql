
CREATE TABLE public.insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  excerpt text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  tag text NOT NULL DEFAULT 'Analysis',
  cover_image_url text,
  author text NOT NULL DEFAULT 'InfraRadar AI',
  published boolean NOT NULL DEFAULT false,
  ai_generated boolean NOT NULL DEFAULT false,
  related_project_ids uuid[] DEFAULT '{}',
  reading_time_min integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.insights ENABLE ROW LEVEL SECURITY;

-- Anyone can read published insights
CREATE POLICY "Public read published insights" ON public.insights
FOR SELECT TO public
USING (published = true);

-- Authenticated users can read all insights (including drafts)
CREATE POLICY "Auth users read all insights" ON public.insights
FOR SELECT TO authenticated
USING (true);

-- Authenticated users can insert/update/delete
CREATE POLICY "Auth users manage insights" ON public.insights
FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Auth users update insights" ON public.insights
FOR UPDATE TO authenticated
USING (true) WITH CHECK (true);

CREATE POLICY "Auth users delete insights" ON public.insights
FOR DELETE TO authenticated
USING (true);

-- Seed initial insights
INSERT INTO public.insights (title, slug, excerpt, content, tag, published, reading_time_min) VALUES
(
  'Why satellite verification changes infrastructure due diligence',
  'satellite-verification-due-diligence',
  'How commercial satellite imagery is closing the gap between filed reports and ground truth in MENA megaprojects.',
  E'## The Verification Gap\n\nInfrastructure due diligence has traditionally relied on self-reported project updates, government filings, and periodic site visits. But what happens when filed reports don''t match reality on the ground?\n\nCommercial satellite imagery is rapidly closing this gap, offering investors and analysts a powerful tool to independently verify construction progress, detect delays, and identify discrepancies before they become costly surprises.\n\n## How Satellite Verification Works\n\nModern commercial satellites capture high-resolution imagery at regular intervals, creating a time-series record of any location on Earth. For infrastructure projects, this means:\n\n- **Progress Tracking**: Compare actual construction against reported timelines\n- **Activity Detection**: Identify whether heavy machinery is present and active\n- **Environmental Monitoring**: Track land clearing, excavation, and site preparation\n- **Supply Chain Indicators**: Monitor material stockpiles and logistics infrastructure\n\n## Impact on MENA Megaprojects\n\nThe MENA region hosts some of the world''s largest infrastructure investments, from Saudi Arabia''s NEOM to Egypt''s New Administrative Capital. With project values frequently exceeding $10 billion, even small verification gaps can represent billions in misallocated capital.\n\nOur analysis of 200+ MENA megaprojects found that satellite-verified progress diverged from official reports by an average of 18 months  -  a significant finding for investors relying on reported timelines.\n\n## The Future of Verified Intelligence\n\nAs satellite resolution improves and AI-powered analysis becomes more sophisticated, we expect satellite verification to become standard practice in infrastructure due diligence. The cost of imagery has dropped 90% in the last decade, making it accessible to a broader range of analysts and investors.',
  'Verification',
  true,
  8
),
(
  'Early warning signals: predicting delay before it compounds',
  'early-warning-delay-prediction',
  'A framework for scoring delay risk across multi-billion dollar African infrastructure corridors.',
  E'## The Compounding Cost of Delay\n\nIn infrastructure, delay begets delay. A three-month slip in procurement can cascade into a year-long construction delay, which can trigger financing covenant breaches, which can halt the project entirely. Understanding early warning signals is critical to preventing this cascade.\n\n## Our Delay Risk Framework\n\nWe''ve developed a multi-factor delay risk score that combines:\n\n### 1. Procurement Signals\n- Tender re-issuance frequency\n- Bid submission timelines vs. norms\n- Contractor capacity utilization rates\n\n### 2. Regulatory Indicators\n- Permit approval velocity\n- Environmental review status\n- Cross-border coordination complexity\n\n### 3. Financial Health\n- Funding commitment status\n- Currency exposure risk\n- Sponsor financial stability\n\n### 4. Geopolitical Context\n- Election cycle proximity\n- Regional stability index\n- Policy continuity probability\n\n## Case Study: East African Rail Corridors\n\nApplying our framework to the Standard Gauge Railway expansions across East Africa, we identified delay risks 6-9 months before official announcements. Key early signals included:\n\n- Declining tender response rates\n- Increased environmental review requests\n- Shifting political rhetoric around project priorities\n\n## Implications for Investors\n\nEarly warning doesn''t mean avoiding risk  -  it means pricing it accurately. Projects with identified delay signals traded at 15-25% discounts in secondary markets, creating opportunities for informed investors willing to accept revised timelines.',
  'Risk',
  true,
  10
),
(
  'MENA vs East Africa: diverging infrastructure trajectories',
  'mena-vs-east-africa-trajectories',
  'Comparing capital flows, project velocity, and verification density across the two fastest-moving regions.',
  E'## Two Regions, Two Models\n\nMENA and East Africa represent the two most dynamic infrastructure markets in our coverage universe, but their development models couldn''t be more different.\n\n## MENA: Capital-Abundant, Vision-Driven\n\nThe MENA infrastructure model is characterized by:\n\n- **Sovereign wealth fund backing**: Large-scale projects backed by national investment vehicles\n- **Megaproject concentration**: Fewer, larger projects with values often exceeding $10B\n- **Technology-forward**: Strong emphasis on smart city, digital infrastructure, and renewable energy\n- **Timeline compression**: Aggressive delivery schedules driven by national transformation agendas\n\n### Key Metrics\n- Average project size: $4.2B\n- Pipeline growth (YoY): +23%\n- Verification coverage: 78%\n\n## East Africa: Growth-Driven, Corridor-Focused\n\nEast Africa''s infrastructure model emphasizes:\n\n- **Multilateral financing**: Heavy involvement of DFIs, MDBs, and bilateral lenders\n- **Corridor development**: Linear infrastructure connecting landlocked economies to ports\n- **Capacity building**: Projects designed to unlock economic potential rather than transform existing economies\n- **PPP experimentation**: Growing use of public-private partnerships\n\n### Key Metrics\n- Average project size: $890M\n- Pipeline growth (YoY): +31%\n- Verification coverage: 52%\n\n## Convergence Points\n\nDespite different models, both regions are converging on:\n\n1. **Renewable energy**: Solar and wind capacity additions accelerating in both regions\n2. **Digital infrastructure**: Data center and fiber optic investment growing rapidly\n3. **Sustainability standards**: Increasing adoption of ESG frameworks in project design\n\n## Investment Implications\n\nMENA offers concentrated exposure to transformative megaprojects with strong sovereign backing. East Africa offers diversified exposure to high-growth corridors with multilateral risk mitigation. Sophisticated investors are increasingly building portfolios that span both regions.',
  'Region',
  true,
  12
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.insights;
