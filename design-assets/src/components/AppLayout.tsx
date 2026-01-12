import { useState, ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Home, 
  Users, 
  CheckSquare, 
  Package, 
  PlusCircle, 
  Menu, 
  X,
  Cpu,
  Share2
} from 'lucide-react';

interface AppLayoutProps {
  children: ReactNode;
  onShareClick?: () => void;
}

export function AppLayout({ children, onShareClick }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const navItems = [
    { path: '/', icon: Home, label: 'Dashboard' },
    { path: '/agents', icon: Users, label: 'Agents' },
    { path: '/tasks', icon: CheckSquare, label: 'Tasks' },
    { path: '/artifacts', icon: Package, label: 'Artifacts' },
    { path: '/new-mission', icon: PlusCircle, label: 'New Mission' },
  ];

  return (
    <div className="min-h-screen relative">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-full w-64 z-50 
          glass border-r border-white/10
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}
      >
        <div className="flex flex-col h-full p-6">
          {/* Logo/Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center glow-violet">
                <Cpu className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
                Trinity
              </h1>
            </div>
            <p className="text-xs text-gray-400 ml-13">Autonomous AI Swarm</p>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-2">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-lg
                    transition-all duration-200
                    ${isActive 
                      ? 'bg-violet-500/20 text-violet-300 glow-violet' 
                      : 'text-gray-400 hover:bg-white/5 hover:text-white'
                    }
                  `}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Footer Info */}
          <div className="glass-light rounded-lg p-4 mt-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-green-400 pulse-glow" />
              <span className="text-xs text-gray-400">System Online</span>
            </div>
            <p className="text-xs text-gray-500">v1.0.0 • Trinity OS</p>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="lg:ml-64 min-h-screen flex flex-col">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 glass border-b border-white/10">
          <div className="flex items-center justify-between px-4 lg:px-8 py-4">
            {/* Mobile Menu Button */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 rounded-lg hover:bg-white/5 transition-colors"
            >
              {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>

            {/* Page Title - Hidden on mobile when sidebar is visible */}
            <div className="hidden lg:block">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-violet-400 via-cyan-400 to-violet-400 bg-clip-text text-transparent">
                {navItems.find(item => item.path === location.pathname)?.label || 'Dashboard'}
              </h2>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={onShareClick}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-violet-500 to-cyan-500 hover:from-violet-600 hover:to-cyan-600 transition-all duration-200 glow-violet"
              >
                <Share2 className="w-4 h-4" />
                <span className="hidden sm:inline font-medium">Share</span>
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6 lg:p-10">
          {children}
        </main>
      </div>
    </div>
  );
}