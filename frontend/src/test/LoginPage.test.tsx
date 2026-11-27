import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@/features/auth/AuthContext';
import { api } from '@/lib/api';
import { LoginPage } from '@/features/auth/LoginPage';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('LoginPage', () => {
  it('renders sign in heading, email and password inputs', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, data: {} } });
    render(
      <BrowserRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </BrowserRouter>
    );

    expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /auto-fill demo/i })).not.toBeInTheDocument();
  });

  it('keeps a saved session when the backend is waking up', async () => {
    localStorage.setItem('accessToken', 'cached-session');
    localStorage.setItem('refreshToken', 'cached-refresh');
    localStorage.setItem('user', JSON.stringify({ email: 'demo@example.test' }));
    const get = vi.spyOn(api, 'get').mockImplementation(async path => {
      if (path === '/auth/me') throw { isAxiosError: true, response: { status: 503 } };
      return { data: { success: true, data: {} } };
    });

    await act(async () => {
      render(<BrowserRouter><AuthProvider><LoginPage /></AuthProvider></BrowserRouter>);
    });

    expect(get).toHaveBeenCalledWith('/auth/me');
    expect(localStorage.getItem('accessToken')).toBe('cached-session');
    expect(localStorage.getItem('refreshToken')).toBe('cached-refresh');
  });

  it('autofills the demo email and signs in without sending a password', async () => {
    const email = 'demo@example.test';
    vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, data: { email } } });
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { data: {
      accessToken: 'demo-session', refreshToken: 'demo-refresh', user: { email },
    } } });

    render(<BrowserRouter><AuthProvider><LoginPage /></AuthProvider></BrowserRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /auto-fill demo credentials/i }));
    expect(screen.getByPlaceholderText('you@example.com')).toHaveValue(email);
    expect(screen.queryByPlaceholderText('••••••••')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/auth/demo'));
    expect(localStorage.getItem('accessToken')).toBe('demo-session');
  });
});

