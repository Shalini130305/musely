import { Link } from 'react-router-dom';
import { Compass, Home } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
      <span className="font-display font-bold text-7xl text-accent-600 mb-2">
        404
      </span>
      <h1 className="text-2xl sm:text-3xl font-display font-bold text-charcoal-900 dark:text-charcoal-50 mb-3">
        Page Not Found
      </h1>
      <p className="text-sm text-charcoal-500 max-w-sm mb-8">
        The visual canvas or page you were looking for doesn't exist or has moved into another collection.
      </p>

      <div className="flex items-center gap-3">
        <Link to="/" className="btn-primary">
          <Home className="w-4 h-4 mr-1" />
          Home Feed
        </Link>
        <Link to="/explore" className="btn-secondary">
          <Compass className="w-4 h-4 mr-1" />
          Explore Visuals
        </Link>
      </div>
    </div>
  );
}
