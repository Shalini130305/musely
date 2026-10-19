import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter your email and password');
      return;
    }

    try {
      setIsLoading(true);
      await login(email, password);
      toast.success('Welcome back to MUSELY!');
      navigate(from, { replace: true });
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to sign in';
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="card p-8 shadow-2xl border border-[var(--border)] max-w-md w-full mx-auto">
      <div className="text-center mb-8">
        <Link to="/welcome" className="inline-block mb-3">
          <span className="font-display font-bold text-3xl tracking-tight text-charcoal-900 dark:text-charcoal-50">
            M<span className="text-accent-600">U</span>SELY
          </span>
        </Link>
        <h2 className="text-xl font-bold text-charcoal-800 dark:text-charcoal-100">
          Welcome back
        </h2>
        <p className="text-xs text-charcoal-500 mt-1">
          Sign in to your MUSELY account
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Email Address</label>
          <input
            id="login-email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@domain.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="input"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="label mb-0">Password</label>
            <Link
              to="/forgot-password"
              className="text-xs text-accent-600 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal-400 hover:text-charcoal-600"
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <button
          id="login-submit"
          type="submit"
          disabled={isLoading}
          className="btn-primary w-full py-3 rounded-xl mt-2 font-semibold flex items-center justify-center gap-2"
        >
          {isLoading ? 'Signing in...' : (
            <>Sign in <ArrowRight className="w-4 h-4" /></>
          )}
        </button>
      </form>

      <p className="text-center text-xs text-charcoal-500 mt-6">
        Don't have an account?{' '}
        <Link to="/register" className="font-semibold text-accent-600 hover:underline">
          Join MUSELY free
        </Link>
      </p>
    </div>
  );
}
