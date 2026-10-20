import { Outlet, useLocation } from 'react-router-dom';
import { Navbar } from '@/components/navigation/Navbar';
import { MobileNav } from '@/components/navigation/MobileNav';

export function MainLayout() {
  const location = useLocation();
  const isCreatePage = location.pathname === '/create';

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col">
      <Navbar />
      <main className={`flex-1 ${isCreatePage ? '' : 'pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:pb-0'}`}>
        <Outlet />
      </main>
      <MobileNav />
    </div>
  );
}
