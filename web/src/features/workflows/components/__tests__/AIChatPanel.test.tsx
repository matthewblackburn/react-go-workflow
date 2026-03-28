import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AIChatPanel } from '../AIChatPanel';

vi.mock('@/api/ai', () => ({
  aiApi: {
    generateWorkflow: vi.fn(),
  },
}));

import { aiApi } from '@/api/ai';

function renderPanel(props: Partial<React.ComponentProps<typeof AIChatPanel>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onWorkflowGenerated: vi.fn(),
    ...props,
  };
  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <AIChatPanel {...defaultProps} />
      </QueryClientProvider>,
    ),
    props: defaultProps,
  };
}

describe('AIChatPanel', () => {
  it('renders the panel with title and input', () => {
    renderPanel();
    expect(screen.getByText('AI Workflow Generator')).toBeInTheDocument();
    expect(screen.getByText(/describe what you want/i)).toBeInTheDocument();
  });

  it('disables send button when input is empty', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('sends message and shows workflow result', async () => {
    const user = userEvent.setup();
    const mockResponse = {
      steps: [
        { id: '1', step_type: 'http_request', step_type_id: 'st-1', name: 'fetch', config: {} },
      ],
      edges: [],
      summary: 'A simple workflow',
    };

    vi.mocked(aiApi.generateWorkflow).mockResolvedValueOnce(mockResponse);

    const { props } = renderPanel();

    const textarea = screen.getByPlaceholderText(/describe your workflow/i);
    await user.type(textarea, 'Fetch data from an API');

    // Click send button
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(aiApi.generateWorkflow).toHaveBeenCalledWith({
        prompt: 'Fetch data from an API',
        history: [],
      });
    });

    await waitFor(() => {
      expect(props.onWorkflowGenerated).toHaveBeenCalledWith(
        mockResponse.steps,
        mockResponse.edges,
        undefined,
      );
    });

    await waitFor(() => {
      expect(screen.getByText('A simple workflow')).toBeInTheDocument();
    });
  });

  it('handles clarifying questions', async () => {
    const user = userEvent.setup();

    vi.mocked(aiApi.generateWorkflow).mockResolvedValueOnce({
      type: 'questions',
      questions: ['What API endpoint?', 'Should errors be retried?'],
    } as any);

    renderPanel();

    const textarea = screen.getByPlaceholderText(/describe your workflow/i);
    await user.type(textarea, 'Build me a workflow');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(screen.getByText(/What API endpoint/)).toBeInTheDocument();
      expect(screen.getByText(/Should errors be retried/)).toBeInTheDocument();
    });
  });

  it('shows loading state while generating', async () => {
    const user = userEvent.setup();

    let resolvePromise: (value: any) => void;
    const pendingPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    vi.mocked(aiApi.generateWorkflow).mockReturnValueOnce(pendingPromise as any);

    renderPanel();

    const textarea = screen.getByPlaceholderText(/describe your workflow/i);
    await user.type(textarea, 'Test workflow');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(screen.getByText('Thinking...')).toBeInTheDocument();
    });

    resolvePromise!({ steps: [], edges: [], summary: '' });
  });
});
