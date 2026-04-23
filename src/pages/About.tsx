import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import { Globe2, Radar, ShieldCheck, Sparkles, Compass, Users } from 'lucide-react';
import { InfradarLogo } from '@/components/InfradarLogo';
import { Button } from '@/components/ui/button';

export default function About() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'About Infradar | Verified Infrastructure Intelligence';
    const meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute('content') ?? '';
    meta?.setAttribute(
      'content',
      'Infradar is the verified intelligence layer for global infrastructure. Learn about our mission, vision, values, and how we turn fragmented signals into decision-ready data.',
    );
    return () => {
      document.title = prevTitle;
      if (prevDesc) meta?.setAttribute('content', prevDesc);
    };
  }, []);

  return (
    <div className="py-16 sm:py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        {/* Hero */}
        <header className="mb-14 text-center">
          <div className="flex items-center justify-center gap-3 mb-6">
            <InfradarLogo size={44} />
            <span className="font-serif text-2xl font-semibold tracking-wide">INFRADAR</span>
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl font-bold mb-4">
            The verified intelligence layer for global infrastructure
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            We turn fragmented tenders, filings, satellite signals and field reports
            into a single, continuously verified pipeline that moves at the speed of capital.
          </p>
        </header>

        {/* Story */}
        <section className="mb-14 space-y-4 text-muted-foreground">
          <h2 className="font-serif text-2xl font-bold text-foreground">Our story</h2>
          <p>
            Infradar was built because infrastructure decisions still rely on stale PDFs,
            scattered spreadsheets and second-hand rumours. Trillions of dollars move through
            projects that are publicly announced yet privately invisible, and the people building
            roads, grids, ports and digital backbones deserve better signal.
          </p>
          <p>
            We started with a simple bet: pair specialised AI agents with human researchers,
            anchor every claim to verifiable evidence, and ship the result as a living dataset
            rather than a quarterly report. That bet became Infradar.
          </p>
        </section>

        {/* Mission / Vision / Values grid */}
        <section className="grid gap-5 md:grid-cols-3 mb-14">
          <div className="rounded-xl border border-border/50 bg-card/40 p-6 backdrop-blur">
            <Compass className="h-6 w-6 text-primary mb-3" />
            <h3 className="font-serif text-xl font-semibold mb-2">Mission</h3>
            <p className="text-sm text-muted-foreground">
              Close the signal gap in global infrastructure by delivering verified,
              decision-ready intelligence on every project that matters.
            </p>
          </div>
          <div className="rounded-xl border border-border/50 bg-card/40 p-6 backdrop-blur">
            <Sparkles className="h-6 w-6 text-primary mb-3" />
            <h3 className="font-serif text-xl font-semibold mb-2">Vision</h3>
            <p className="text-sm text-muted-foreground">
              A world where capital flows toward the right projects faster, because
              every developer, lender and regulator works from the same trusted source of truth.
            </p>
          </div>
          <div className="rounded-xl border border-border/50 bg-card/40 p-6 backdrop-blur">
            <ShieldCheck className="h-6 w-6 text-primary mb-3" />
            <h3 className="font-serif text-xl font-semibold mb-2">Promise</h3>
            <p className="text-sm text-muted-foreground">
              Every signal is sourced, scored and reviewed. If we cannot verify it,
              we will not ship it.
            </p>
          </div>
        </section>

        {/* What we do */}
        <section className="mb-14 space-y-4">
          <h2 className="font-serif text-2xl font-bold text-foreground">What we do</h2>
          <p className="text-muted-foreground">
            Infradar continuously monitors infrastructure pipelines across 14 global regions,
            from emerging markets to OECD programs. Twelve specialised intelligence agents
            ingest from tenders, multilateral bank registries, regulatory filings, satellite
            imagery, news and partner feeds. Researchers verify the highest-impact signals
            before they reach the platform.
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 mt-4">
            <li className="flex gap-3 rounded-lg border border-border/40 p-4">
              <Radar className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-foreground">Continuous monitoring</div>
                <div className="text-sm text-muted-foreground">Agents run on schedule, not on request.</div>
              </div>
            </li>
            <li className="flex gap-3 rounded-lg border border-border/40 p-4">
              <Globe2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-foreground">Global coverage</div>
                <div className="text-sm text-muted-foreground">14 regions, every major infrastructure sector.</div>
              </div>
            </li>
            <li className="flex gap-3 rounded-lg border border-border/40 p-4">
              <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-foreground">Verified by humans</div>
                <div className="text-sm text-muted-foreground">Researchers approve before publish, with full audit trail.</div>
              </div>
            </li>
            <li className="flex gap-3 rounded-lg border border-border/40 p-4">
              <Users className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-foreground">Built for operators</div>
                <div className="text-sm text-muted-foreground">Developers, lenders, regulators and advisors in one workspace.</div>
              </div>
            </li>
          </ul>
        </section>

        {/* Values */}
        <section className="mb-14">
          <h2 className="font-serif text-2xl font-bold text-foreground mb-4">What we value</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-border/40 p-5">
              <div className="font-semibold text-foreground mb-1">Evidence over opinion</div>
              <p className="text-sm text-muted-foreground">Every data point carries provenance, a confidence score and a timestamp.</p>
            </div>
            <div className="rounded-lg border border-border/40 p-5">
              <div className="font-semibold text-foreground mb-1">Speed with rigour</div>
              <p className="text-sm text-muted-foreground">Real-time pipelines, but nothing ships unverified.</p>
            </div>
            <div className="rounded-lg border border-border/40 p-5">
              <div className="font-semibold text-foreground mb-1">Global by default</div>
              <p className="text-sm text-muted-foreground">Emerging and frontier markets are first-class, not an afterthought.</p>
            </div>
            <div className="rounded-lg border border-border/40 p-5">
              <div className="font-semibold text-foreground mb-1">Built with users</div>
              <p className="text-sm text-muted-foreground">Researchers, analysts and operators shape the roadmap directly.</p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-xl border border-border/50 bg-card/40 p-8 text-center backdrop-blur">
          <h2 className="font-serif text-2xl font-bold mb-2">Work with us</h2>
          <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
            Whether you are tracking a single corridor or an entire portfolio, we would like to hear what you are building.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link to="/contact">Get in touch</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/explore">Explore the platform</Link>
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
