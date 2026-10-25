import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Eye, EyeOff, ArrowRight, ShieldCheck, KeyRound, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { login, verify2FA, verify2FARecovery } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // 2FA state
  const [requires2FA, setRequires2FA] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [isVerifying2FA, setIsVerifying2FA] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter your email and password');
      return;
    }

    try {
      setIsLoading(true);
      const res = await login(email, password);
      if (res.requires2FA && res.tempToken) {
        setTempToken(res.tempToken);
        setRequires2FA(true);
        toast('Two-step verification required. Enter the code from your authenticator app.', {
          icon: '🛡️',
        });
      } else {
        toast.success('Welcome back to MUSELY!');
        navigate(from, { replace: true });
      }
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to sign in';
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!useRecovery && (!totpCode || totpCode.trim().length !== 6)) {
      toast.error('Please enter the 6-digit code from your authenticator app');
      return;
    }

    if (useRecovery && !recoveryCode.trim()) {
      toast.error('Please enter a recovery code');
      return;
    }

    try {
      setIsVerifying2FA(true);
      if (useRecovery) {
        await verify2FARecovery(tempToken, recoveryCode.trim());
        toast.success('Account verified via recovery code. Welcome back!');
      } else {
        await verify2FA(tempToken, totpCode.trim());
        toast.success('Two-step verification verified!');
      }
      navigate(from, { replace: true });
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Verification failed. Please check your code.';
      toast.error(msg);
    } finally {
      setIsVerifying2FA(false);
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
          {requires2FA ? 'Two-Step Verification' : 'Welcome back'}
        </h2>
        <p className="text-xs text-charcoal-500 mt-1">
          {requires2FA
            ? (useRecovery ? 'Enter an unused emergency recovery code' : 'Enter the 6-digit code from your authenticator app')
            : 'Sign in to your MUSELY account'}
        </p>
      </div>

      {!requires2FA ? (
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
      ) : (
        <form onSubmit={handle2FASubmit} className="space-y-4">
          <div className="p-4 rounded-2xl bg-accent-500/10 border border-accent-500/20 text-center mb-2">
            <ShieldCheck className="w-8 h-8 text-accent-500 mx-auto mb-2" />
            <p className="text-xs text-charcoal-600 dark:text-charcoal-300">
              Account protected with two-step verification.
            </p>
          </div>

          {!useRecovery ? (
            <div>
              <label className="label">6-Digit Authenticator Code</label>
              <input
                id="login-totp"
                type="text"
                maxLength={6}
                autoFocus
                required
                placeholder="123456"
                value={totpCode}
                onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                className="input text-center text-xl tracking-widest font-mono font-bold"
              />
            </div>
          ) : (
            <div>
              <label className="label">Emergency Recovery Code</label>
              <input
                id="login-recovery"
                type="text"
                autoFocus
                required
                placeholder="ABCD-EFGH"
                value={recoveryCode}
                onChange={e => setRecoveryCode(e.target.value.toUpperCase())}
                className="input text-center font-mono font-bold tracking-wider"
              />
            </div>
          )}

          <button
            id="verify-2fa-submit"
            type="submit"
            disabled={isVerifying2FA}
            className="btn-primary w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2"
          >
            {isVerifying2FA ? 'Verifying...' : 'Verify and Sign In'}
          </button>

          <div className="flex items-center justify-between pt-2 text-xs">
            <button
              type="button"
              onClick={() => {
                setUseRecovery(v => !v);
                setTotpCode('');
                setRecoveryCode('');
              }}
              className="text-accent-600 hover:underline flex items-center gap-1"
            >
              <KeyRound className="w-3.5 h-3.5" />
              {useRecovery ? 'Use authenticator app' : 'Use recovery code'}
            </button>

            <button
              type="button"
              onClick={() => {
                setRequires2FA(false);
                setTempToken('');
                setTotpCode('');
                setRecoveryCode('');
              }}
              className="text-charcoal-500 hover:text-charcoal-800 dark:hover:text-charcoal-200 flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
          </div>
        </form>
      )}

      {!requires2FA && (
        <p className="text-center text-xs text-charcoal-500 mt-6">
          Don't have an account?{' '}
          <Link to="/register" className="font-semibold text-accent-600 hover:underline">
            Join MUSELY free
          </Link>
        </p>
      )}
    </div>
  );
}
