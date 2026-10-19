import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, CheckCircle, AlertTriangle } from 'lucide-react';
import api from '@/services/api';
import toast from 'react-hot-toast';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div className="card p-8 shadow-2xl border border-[var(--border)] max-w-md w-full mx-auto text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-charcoal-900 dark:text-charcoal-50 mb-2">Invalid Link</h2>
        <p className="text-sm text-charcoal-500 mb-6">
          This password reset link is invalid or missing. Please request a new one.
        </p>
        <Link to="/forgot-password" className="btn-primary w-full py-3 rounded-xl flex items-center justify-center">
          Request New Link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="card p-8 shadow-2xl border border-[var(--border)] max-w-md w-full mx-auto text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-charcoal-900 dark:text-charcoal-50 mb-2">
          Password Reset!
        </h2>
        <p className="text-sm text-charcoal-500 mb-6">
          Your password has been reset successfully. Sign in with your new password.
        </p>
        <button
          onClick={() => navigate('/login')}
          className="btn-primary w-full py-3 rounded-xl font-semibold"
        >
          Sign In
        </button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    try {
      setIsLoading(true);
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to reset password. The link may have expired.');
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
          Set a new password
        </h2>
        <p className="text-xs text-charcoal-500 mt-1">
          Choose a strong password for your MUSELY account.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">New Password</label>
          <div className="relative">
            <input
              id="reset-password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal-400 hover:text-charcoal-600"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {password.length > 0 && (
            <p className={`text-xs mt-1 ${password.length >= 8 ? 'text-green-500' : 'text-red-400'}`}>
              {password.length >= 8 ? '✓ Strong enough' : `${8 - password.length} more characters needed`}
            </p>
          )}
        </div>

        <div>
          <label className="label">Confirm Password</label>
          <input
            id="reset-confirm"
            type={showPassword ? 'text' : 'password'}
            required
            autoComplete="new-password"
            placeholder="Repeat your new password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            className="input"
          />
          {confirmPassword.length > 0 && (
            <p className={`text-xs mt-1 ${password === confirmPassword ? 'text-green-500' : 'text-red-400'}`}>
              {password === confirmPassword ? '✓ Passwords match' : 'Passwords do not match'}
            </p>
          )}
        </div>

        <button
          id="reset-submit"
          type="submit"
          disabled={isLoading || password.length < 8 || password !== confirmPassword}
          className="btn-primary w-full py-3 rounded-xl font-semibold"
        >
          {isLoading ? 'Resetting...' : 'Reset Password'}
        </button>
      </form>
    </div>
  );
}
