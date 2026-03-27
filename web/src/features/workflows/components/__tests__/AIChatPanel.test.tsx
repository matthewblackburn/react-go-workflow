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
    expect(screen.getByText('Generate Workflow')).toBeInTheDocument();
  });

  it('disables generate button when prompt is empty', () => {
    renderPanel();
    const button = screen.getByText('Generate Workflow').closest('button');
    expect(button).toBeDisabled();
  });

  it('enables generate button when prompt has text', async () => {
    const user = userEvent.setup();
    renderPanel();

    const textarea = screen.getByPlaceholderText(/when a webhook fires/i);
    await user.type(textarea, 'Create a workflow');

    const button = screen.getByText('Generate Workflow').closest('button');
    expect(button).not.toBeDisabled();
  });

  it('calls API and onWorkflowGenerated on success', async () => {
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

    const textarea = screen.getByPlaceholderText(/when a webhook fires/i);
    await user.type(textarea, 'Fetch data from an API');

    const button = screen.getByText('Generate Workflow').closest('button')!;
    await user.click(button);

    await waitFor(() => {
      expect(aiApi.generateWorkflow).toHaveBeenCalledWith({
        prompt: 'Fetch data from an API',
      });
    });

    await waitFor(() => {
      expect(props.onWorkflowGenerated).toHaveBeenCalledWith(
        mockResponse.steps,
        mockResponse.edges,
        undefined,
      );
    });

    // Summary should be displayed
    await waitFor(() => {
      expect(screen.getByText('A simple workflow')).toBeInTheDocument();
    });
  });

  it('shows loading state while generating', async () => {
    const user = userEvent.setup();

    // Create a promise that we control
    let resolvePromise: (value: any) => void;
    const pendingPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    vi.mocked(aiApi.generateWorkflow).mockReturnValueOnce(pendingPromise as any);

    renderPanel();

    const textarea = screen.getByPlaceholderText(/when a webhook fires/i);
    await user.type(textarea, 'Test workflow');

    const button = screen.getByText('Generate Workflow').closest('button')!;
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Generating...')).toBeInTheDocument();
    });

    // Resolve the promise to clean up
    resolvePromise!({ steps: [], edges: [], summary: '' });
  });
});
