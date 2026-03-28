import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Register from '../Register';

vi.mock('@/lib/auth/auth-context', () => ({
  useAuth: () => ({
    checkSession: vi.fn(),
    isAuthenticated: false,
    isLoading: false,
    signOut: vi.fn(),
  }),
}));

vi.mock('supertokens-web-js/recipe/emailpassword', () => ({
  default: {
    signUp: vi.fn(),
  },
}));

function renderRegister() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Register', () => {
  it('renders email, password, and confirm password fields', () => {
    renderRegister();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
  });

  it('disables submit when fields are empty', () => {
    renderRegister();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled();
  });

  it('enables submit when all fields are filled', async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByLabelText('Email'), 'test@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.type(screen.getByLabelText('Confirm password'), 'password123');

    expect(screen.getByRole('button', { name: 'Create account' })).not.toBeDisabled();
  });

  it('shows error when passwords do not match', async () => {
    const user = userEvent.setup();
    renderRegister();

    await user.type(screen.getByLabelText('Email'), 'test@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.type(screen.getByLabelText('Confirm password'), 'different');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
  });

  it('has a link to login page', () => {
    renderRegister();
    expect(screen.getByText('Sign in')).toHaveAttribute('href', '/login');
  });
});
