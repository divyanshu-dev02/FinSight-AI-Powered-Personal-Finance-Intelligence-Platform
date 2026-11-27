import { AuthShell } from './AuthShell';
import { useEffect, useState, type FormEvent } from 'react';
import { api, type ApiResponse } from '@/lib/api';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { LoadingSpinner } from '@/components/LoadingSpinner';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { login, loginDemo } = useAuth();
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [demoEmail, setDemoEmail] = useState<string>();
  const [useDemo, setUseDemo] = useState(false);
  const [demoPending, setDemoPending] = useState(false);

  useEffect(() => {
    const request = new AbortController();
    api.get<ApiResponse<{ email?: string }>>('/auth/demo', { signal: request.signal })
      .then(response => {
        if (!request.signal.aborted) setDemoEmail(response.data.data.email);
      })
      .catch(() => {
        if (!request.signal.aborted) setDemoEmail(undefined);
      });
    return () => request.abort();
  }, []);

  const {
    register,
    handleSubmit,
    setValue,
    resetField,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setErrorMessage(null);
    try {
      await login(data.email, data.password);
      navigate('/dashboard');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: { message?: string } } } };
      setErrorMessage(
        error.response?.data?.error?.message ||
        'Invalid email or password.'
      );
    }
  };

  const enterDemo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setDemoPending(true);
    try {
      await loginDemo();
      navigate('/dashboard');
    } catch {
      setErrorMessage('Could not open the demo. Try again.');
    } finally {
      setDemoPending(false);
    }
  };


  return (
    <AuthShell title="Sign in to your account" description="Open your personal finance workspace.">
        {errorMessage && (
          <div role="alert" className="rounded-xl bg-red-50 p-4 border border-red-200">
            <p className="text-xs text-red-700 leading-relaxed">{errorMessage}</p>
          </div>
        )}

        {demoEmail && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            <span className="font-semibold">Demo account</span>
            <button type="button" disabled={demoPending || isSubmitting}
              className="font-semibold text-blue-700 underline disabled:opacity-50"
              onClick={() => {
                setValue('email', demoEmail);
                resetField('password', { defaultValue: '' });
                clearErrors();
                setErrorMessage(null);
                setUseDemo(true);
              }}>
              Auto-fill Demo Credentials
            </button>
          </div>
        )}

        <form className="space-y-4" onSubmit={useDemo ? event => void enterDemo(event) : handleSubmit(onSubmit)}>
          <div>
            <label htmlFor="login-email-address" className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">Email address</label>
            <input
              id="login-email-address"
              type="email"
              autoComplete="email"
              {...register('email', { onChange: () => setUseDemo(false) })}
              className="mt-1.5 block w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-gray-900 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 text-sm transition-all"
              placeholder="you@example.com"
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
            )}
          </div>

          {useDemo ? (
            <p className="text-sm text-gray-600">Demo sign-in is ready. Select Sign In to open the sample account.</p>
          ) : (
            <div>
              <label htmlFor="login-password" className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">Password</label>
              <input
              id="login-password"
                type="password"
                autoComplete="current-password"
                {...register('password')}
                className="mt-1.5 block w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-gray-900 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 text-sm transition-all"
                placeholder="••••••••"
              />
              {errors.password && (
                <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || demoPending}
            className="flex w-full justify-center items-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 transition-all cursor-pointer"
          >
            {isSubmitting || demoPending ? <LoadingSpinner size="sm" className="mr-2 border-white" /> : null}
            Sign In
          </button>
        </form>

        <div className="text-center text-sm text-gray-600 pt-2 border-t border-gray-100">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-semibold text-blue-600 hover:text-blue-500">
            Create an account
          </Link>
        </div>
    </AuthShell>
  );
}
