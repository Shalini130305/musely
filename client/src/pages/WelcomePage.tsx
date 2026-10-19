import { Link } from 'react-router-dom';
import { ArrowRight, Compass, Sparkles, Image, ShieldCheck, Heart } from 'lucide-react';

export default function WelcomePage() {
  const showcaseImages = [
    {
      url: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=600&q=80',
      title: 'Digital Horizons',
      cat: 'Digital Art',
      span: 'row-span-2',
    },
    {
      url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80',
      title: 'Monochrome Silhouette',
      cat: 'Fashion',
      span: 'row-span-3',
    },
    {
      url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80',
      title: 'Alpine Morning',
      cat: 'Photography',
      span: 'row-span-2',
    },
    {
      url: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=600&q=80',
      title: 'Warm Minimalism',
      cat: 'Interior Design',
      span: 'row-span-3',
    },
    {
      url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&q=80',
      title: 'Fluid Chroma',
      cat: 'Art',
      span: 'row-span-2',
    },
    {
      url: 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=600&q=80',
      title: 'Kyoto Alleyway',
      cat: 'Travel',
      span: 'row-span-2',
    },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-charcoal-900 dark:text-charcoal-50 flex flex-col justify-between">
      {/* Top Bar */}
      <header className="max-w-7xl mx-auto w-full px-6 py-6 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <span className="font-display font-bold text-3xl tracking-tight text-charcoal-900 dark:text-charcoal-50">
            M<span className="text-accent-600">U</span>SELY
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <Link to="/explore" className="btn-ghost hidden sm:inline-flex">
            Explore
          </Link>
          <Link to="/login" className="btn-secondary">
            Sign In
          </Link>
          <Link to="/register" className="btn-primary">
            Join Musely
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-6 py-12 flex-1 flex flex-col items-center justify-center text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent-50 dark:bg-accent-950/60 text-accent-600 dark:text-accent-400 text-xs font-semibold uppercase tracking-wider mb-6 animate-fade-in">
          <Sparkles className="w-3.5 h-3.5" />
          A Curated Canvas for Visual Thinkers
        </div>

        <h1 className="text-4xl sm:text-6xl md:text-7xl font-display font-bold tracking-tight max-w-4xl text-balance leading-[1.1] mb-6">
          Discover ideas that elevate your creative perspective.
        </h1>

        <p className="text-lg sm:text-xl text-charcoal-600 dark:text-charcoal-300 max-w-2xl text-balance mb-8">
          Musely is a refined visual discovery haven. Collect inspiration, share original imagery, create boards, and connect with visionary creators.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 mb-16">
          <Link to="/register" className="btn-primary text-base px-8 py-3.5 rounded-2xl shadow-lg shadow-accent-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all">
            Get Started Free
            <ArrowRight className="w-5 h-5 ml-1" />
          </Link>
          <Link to="/explore" className="btn-secondary text-base px-8 py-3.5 rounded-2xl">
            <Compass className="w-5 h-5 mr-1" />
            Explore Showcase
          </Link>
        </div>

        {/* Visual Showcase Ribbon */}
        <div className="w-full grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 py-8">
          {showcaseImages.map((img, i) => (
            <div
              key={i}
              className="group relative rounded-2xl overflow-hidden aspect-[3/4] shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
            >
              <img
                src={img.url}
                alt={img.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-3 flex flex-col justify-end text-left">
                <span className="text-[10px] uppercase font-bold text-accent-300 tracking-wider">
                  {img.cat}
                </span>
                <span className="text-xs font-semibold text-white truncate">
                  {img.title}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Features highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16 max-w-5xl text-left">
          <div className="p-6 rounded-3xl bg-cream-100 dark:bg-charcoal-800/60 border border-[var(--border)]">
            <div className="w-12 h-12 rounded-2xl bg-accent-600/10 text-accent-600 flex items-center justify-center mb-4">
              <Image className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-lg mb-2">High-Fidelity Canvas</h3>
            <p className="text-sm text-charcoal-600 dark:text-charcoal-400">
              Infinite masonry streams with seamless image preservation and rich aspect-ratio adaptations.
            </p>
          </div>

          <div className="p-6 rounded-3xl bg-cream-100 dark:bg-charcoal-800/60 border border-[var(--border)]">
            <div className="w-12 h-12 rounded-2xl bg-accent-600/10 text-accent-600 flex items-center justify-center mb-4">
              <Heart className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Curated Collections</h3>
            <p className="text-sm text-charcoal-600 dark:text-charcoal-400">
              Organize visual gems into bespoke public or private thematic boards tailored to your projects.
            </p>
          </div>

          <div className="p-6 rounded-3xl bg-cream-100 dark:bg-charcoal-800/60 border border-[var(--border)]">
            <div className="w-12 h-12 rounded-2xl bg-accent-600/10 text-accent-600 flex items-center justify-center mb-4">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Creator Community</h3>
            <p className="text-sm text-charcoal-600 dark:text-charcoal-400">
              Follow talented photographers, artists, and designers, interact with feedback, and share attribution links.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-8 px-6 text-center text-xs text-charcoal-500">
        <p>© {new Date().getFullYear()} Musely Visual Discovery. Crafted for creators and thinkers.</p>
      </footer>
    </div>
  );
}
