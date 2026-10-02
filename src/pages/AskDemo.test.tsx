import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn().mockResolvedValue({ data: { examples: [], queries_used: 0 }, error: null }),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));

import AskDemo from './AskDemo';

describe('AskDemo ?q= prefill', () => {
  it('pre-fills the question without running it', async () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/ask-demo?q=Solar%20micro-grid%20tenders%20in%20the%20Pacific']}>
          <AskDemo />
        </MemoryRouter>
      </HelmetProvider>,
    );
    expect(await screen.findByDisplayValue('Solar micro-grid tenders in the Pacific')).toBeTruthy();
    // Only the on-mount examples call; no search was submitted.
    expect(invoke.mock.calls.every(([, opts]) => opts.body.mode === 'examples')).toBe(true);
  });
});
