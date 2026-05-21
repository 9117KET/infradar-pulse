import { Seo } from '@/components/Seo';

export default function Press() {
  return (
    <div className="py-20">
      <Seo
        title="Press & Media | InfradarAI"
        description="Press inquiries, brand assets and media kit for InfradarAI — verified global infrastructure intelligence across 14 regions."
        path="/press"
      />
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <h1 className="font-serif text-4xl font-bold mb-4">Press</h1>
        <p className="text-muted-foreground mb-8">For media inquiries, brand assets, and press releases.</p>
        <div className="glass-panel rounded-xl p-8">
          <p className="text-muted-foreground mb-4">
            For press inquiries, please contact{' '}
            <a className="text-primary underline" href="mailto:press@infradarai.com">press@infradarai.com</a>.
          </p>
          <p className="text-muted-foreground mb-4">Brand assets and media kit available upon request.</p>
          <a href="/contact" className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent">Contact press team</a>
        </div>
      </div>
    </div>
  );
}
