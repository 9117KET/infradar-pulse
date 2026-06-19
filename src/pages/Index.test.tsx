import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import Index from './Index';

vi.mock('@/integrations/supabase/client', () => {
  const channel = { on: () => channel, subscribe: () => channel };
  return {
    supabase: {
      from: () => ({
        select: () => ({ data: [], error: null }),
        insert: () => ({ error: null }),
        eq: () => ({ data: [], error: null }),
      }),
      rpc: () => Promise.resolve({ data: null, error: null }),
      auth: { getSession: () => ({ data: { session: null } }) },
      channel: () => channel,
      removeChannel: () => Promise.resolve(),
    },
  };
});

vi.mock('@/hooks/use-public-project-locations', () => ({
  usePublicProjectLocations: () => ({ locations: [], loading: false }),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('framer-motion', () => {
  const React = require('react');
  const allowedProps = new Set([
    'className', 'style', 'id', 'onClick', 'onSubmit', 'onChange',
    'children', 'data-testid', 'aria-label', 'role', 'tabIndex',
  ]);
  const strip = (props: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(props).filter(([k]) => allowedProps.has(k)));
  const makeEl = (tag: string) =>
    React.forwardRef(({ children, ...rest }: Record<string, unknown>, ref: unknown) =>
      React.createElement(tag, { ...strip(rest), ref }, children));
  const motion = new Proxy({}, { get: (_t, tag: string) => makeEl(tag) });
  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    useInView: () => true,
    useAnimation: () => ({ start: vi.fn() }),
  };
});

vi.mock('@/components/home/DemoSection', () => ({
  DemoSection: () => <section data-testid="demo-section">DemoSection</section>,
}));

vi.mock('@/components/Seo', () => ({
  Seo: () => null,
}));

beforeAll(() => {
  global.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver;
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

function renderIndex() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Index />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Index page - lean home sections present', () => {
  it('renders without crashing', () => {
    expect(() => renderIndex()).not.toThrow();
  });

  it('renders ProblemSection stats', () => {
    renderIndex();
    expect(screen.getByText(/capital at risk/i)).toBeInTheDocument();
  });

  it('does not render the problem flaw list (moved to /about and /services)', () => {
    renderIndex();
    expect(screen.queryByText(/Pricing excludes the mid-market entirely/i)).not.toBeInTheDocument();
  });

  it('does not render CapabilitiesSection (moved to /services)', () => {
    renderIndex();
    expect(screen.queryByText(/Multi-source verification/i)).not.toBeInTheDocument();
  });

  it('does not render PersonasSection (moved to /services)', () => {
    renderIndex();
    expect(screen.queryByText(/Built for the teams that shape/i)).not.toBeInTheDocument();
  });

  it('renders PipelineSection steps', () => {
    renderIndex();
    expect(screen.getByText(/From signals to decisions/i)).toBeInTheDocument();
  });

  it('renders EngagementSection form', () => {
    renderIndex();
    expect(screen.getByPlaceholderText(/your name/i)).toBeInTheDocument();
  });

  it('renders DemoSection', () => {
    renderIndex();
    expect(screen.getByTestId('demo-section')).toBeInTheDocument();
  });
});
