import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import api from '@/services/api';
import toast from 'react-hot-toast';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error('Please enter your email address');
      return;
    }

    try {
      setIsLoading(true);
      await api.post('/auth/forgot-password', { email: email.toLowerCase().trim() });
      setSent(true);
    } catch {
      // Still show success to prevent email enumeration
      setSent(true);
    } finally {
      setIsLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="card p-8 shadow-2xl border border-[var(--border)] max-w-md w-full mx-auto text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-charcoal-900 dark:text-charcoal-50 mb-2">
          Check your email
        </h2>
        <p className="text-sm text-charcoal-500 mb-6">
          If an account exists for <strong>{email}</strong>, we've sent a password reset link.
          The link expires in 1 hour.
        </p>
        <p className="text-xs text-charcoal-400 mb-6">
          Didn't receive it? Check your spam folder, or{' '}
          <button
            onClick={() => setSent(false)}
            className="text-accent-600 hover:underline font-medium"
          >
            try again
          </button>
          .
        </p>
        <Link to="/login" className="btn-primary w-full py-3 rounded-xl flex items-center justify-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="card p-8 shadow-2xl border border-[var(--border)] max-w-md w-full mx-auto">
      <div className="text-center mb-8">
        <Link to="/welcome" className="inline-block mb-3">
          <span className="font-display font-bold text-3xl tracking-tight text-charcoal-900 dark:text-charcoal-50">
            M<span className="text-accent-600">U</span>SELY
          </span>
        </Link>
        <h2 className="text-xl font-bold text-charcoal-800 dark:text-charcoal-100">
          Forgot your password?
        </h2>
        <p className="text-xs text-charcoal-500 mt-1">
          Enter your email and we'll send you a reset link.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Email Address</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-400" />
            <input
              id="forgot-email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@domain.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="input pl-9"
            />
          </div>
        </div>

        <button
          id="forgot-submit"
          type="submit"
          disabled={isLoading}
          className="btn-primary w-full py-3 rounded-xl font-semibold"
        >
          {isLoading ? 'Sending...' : 'Send Reset Link'}
        </button>
      </form>

      <p className="text-center text-xs text-charcoal-500 mt-6">
        Remember your password?{' '}
        <Link to="/login" className="font-semibold text-accent-600 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
