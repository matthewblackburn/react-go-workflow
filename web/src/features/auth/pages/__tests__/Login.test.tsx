import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Login from '../Login';

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
    signIn: vi.fn(),
  },
}));

function renderLogin() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Login', () => {
  it('renders email and password fields', () => {
    renderLogin();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('disables submit when fields are empty', () => {
    renderLogin();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  });

  it('enables submit when fields are filled', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'test@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');

    expect(screen.getByRole('button', { name: 'Sign in' })).not.toBeDisabled();
  });

  it('has a link to register page', () => {
    renderLogin();
    expect(screen.getByText('Create one')).toHaveAttribute('href', '/register');
  });
});
