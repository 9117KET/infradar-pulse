import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GettingStartedChecklist } from './GettingStartedChecklist';

// --- Mocks ------------------------------------------------------------------
const gettingStarted = {
  steps: [
    { id: 'track', label: 'Track 5 projects', desc: 'Build your portfolio.', done: false, action: { label: 'Browse projects', href: '/dashboard/projects' } },
    { id: 'alert', label: 'Set up an alert rule', desc: 'Get notified.', done: true, action: { label: 'Configure alerts', href: '/dashboard/alerts' } },
  ],
  doneCount: 1,
  allDone: false,
  dismissed: false,
  dismiss: vi.fn().mockResolvedValue(undefined),
  reopen: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@/hooks/use-getting-started', () => ({
  useGettingStarted: () => gettingStarted,
}));

function renderChecklist() {
  return render(
    <MemoryRouter>
      <GettingStartedChecklist />
    </MemoryRouter>,
  );
}

describe('GettingStartedChecklist', () => {
  beforeEach(() => {
    gettingStarted.dismissed = false;
    gettingStarted.allDone = false;
    gettingStarted.dismiss.mockClear();
  });

  it('renders the steps with progress and action links', () => {
    renderChecklist();
    expect(screen.getByText('Getting started')).toBeInTheDocument();
    expect(screen.getByText('1/2 complete')).toBeInTheDocument();
    expect(screen.getByText('Track 5 projects')).toBeInTheDocument();
    // Done steps hide their action link; open steps show it
    expect(screen.getByText(/Browse projects/)).toBeInTheDocument();
    expect(screen.queryByText(/Configure alerts/)).not.toBeInTheDocument();
  });

  it('renders nothing when dismissed', () => {
    gettingStarted.dismissed = true;
    const { container } = renderChecklist();
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the celebration card when all steps are done', () => {
    gettingStarted.allDone = true;
    renderChecklist();
    expect(screen.getByText(/You're all set/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(gettingStarted.dismiss).toHaveBeenCalled();
  });

  it('dismisses via the X button', () => {
    renderChecklist();
    fireEvent.click(screen.getByLabelText('Dismiss checklist'));
    expect(gettingStarted.dismiss).toHaveBeenCalled();
  });
});
