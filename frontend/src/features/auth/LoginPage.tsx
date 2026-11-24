import { useState } from 'react';
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
  const { login } = useAuth();
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: 'divyanshu@finsight.local',
      password: 'SecurePassword123!',
    },
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
        'Invalid email or password. If you are on a new cloud deployment, click Auto-fill Credentials or Register a new account.'
      );
    }
  };

  const handleAutoFill = () => {
    setValue('email', 'divyanshu@finsight.local', { shouldValidate: true });
    setValue('password', 'SecurePassword123!', { shouldValidate: true });
    setErrorMessage(null);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/20 to-slate-100 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6 rounded-2xl bg-white p-8 shadow-xl border border-gray-100">
        <div className="text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white font-extrabold text-2xl shadow-md mb-2">
            F
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">FinSight</h1>
          <p className="mt-1 text-sm text-gray-500 font-medium">Personal Finance Intelligence Platform</p>
          <h2 className="mt-4 text-lg font-semibold text-gray-800">Sign in to your account</h2>
        </div>

        {errorMessage && (
          <div className="rounded-xl bg-red-50 p-4 border border-red-200">
            <p className="text-xs text-red-700 leading-relaxed">{errorMessage}</p>
          </div>
        )}

        {/* Demo Credentials Quick-Fill Card */}
        <div className="rounded-xl bg-blue-50/80 p-4 border border-blue-200 text-xs text-blue-900 space-y-2">
          <div className="font-semibold flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-bold text-blue-950">
              <span>🔑</span>
              <span>Default Demo Account</span>
            </span>
            <button
              type="button"
              onClick={handleAutoFill}
              className="font-bold text-blue-700 hover:text-blue-900 bg-blue-100/80 hover:bg-blue-200/80 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
            >
              Auto-fill Credentials
            </button>
          </div>
          <div className="font-mono text-[11px] text-blue-800 space-y-0.5 bg-white/70 p-2.5 rounded-lg border border-blue-100">
            <div>Email: <span className="font-bold text-gray-900">divyanshu@finsight.local</span></div>
            <div>Password: <span className="font-bold text-gray-900">SecurePassword123!</span></div>
          </div>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">Email address</label>
            <input
              type="email"
              autoComplete="email"
              {...register('email')}
              className="mt-1.5 block w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-gray-900 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 text-sm transition-all"
              placeholder="you@example.com"
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">Password</label>
            <input
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

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full justify-center items-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 transition-all cursor-pointer"
          >
            {isSubmitting ? <LoadingSpinner size="sm" className="mr-2 border-white" /> : null}
            Sign In
          </button>
        </form>

        <div className="text-center text-sm text-gray-600 pt-2 border-t border-gray-100">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-semibold text-blue-600 hover:text-blue-500">
            Create an account
          </Link>
        </div>
      </div>
    </div>
  );
}
