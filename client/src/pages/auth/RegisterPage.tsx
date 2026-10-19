import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !username || !displayName || !password) {
      toast.error('All fields are required');
      return;
    }
    if (username.length < 3) {
      toast.error('Username must be at least 3 characters');
      return;
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    try {
      setIsLoading(true);
      await register(email, username, displayName, password);
      toast.success('Welcome to Musely! Your creative canvas awaits.');
      navigate('/', { replace: true });
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="card p-8 shadow-2xl border border-[var(--border)] max-w-md w-full mx-auto">
      <div className="text-center mb-8">
        <Link to="/" className="inline-block mb-3">
          <span className="font-display font-bold text-3xl tracking-tight text-charcoal-900 dark:text-charcoal-50">
            M<span className="text-accent-600">U</span>SELY
          </span>
        </Link>
        <h2 className="text-xl font-bold text-charcoal-800 dark:text-charcoal-100">
          Create your account
        </h2>
        <p className="text-xs text-charcoal-500 mt-1">
          Join a global community of designers, photographers, and curators.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Display Name</label>
          <input
            type="text"
            required
            placeholder="e.g. Elena Vance"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            className="input"
          />
        </div>

        <div>
          <label className="label">Username</label>
          <input
            type="text"
            required
            placeholder="elenavance (letters, numbers, underscores)"
            value={username}
            onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            className="input"
          />
        </div>

        <div>
          <label className="label">Email Address</label>
          <input
            type="email"
            required
            placeholder="elena@studio.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="input"
          />
        </div>

        <div>
          <label className="label">Password (8+ chars)</label>
          <input
            type="password"
            required
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="input"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="btn-primary w-full py-3 rounded-xl mt-2 font-semibold"
        >
          {isLoading ? 'Creating account...' : 'Create Account'}
        </button>
      </form>

      <p className="text-center text-xs text-charcoal-500 mt-6">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-accent-600 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
