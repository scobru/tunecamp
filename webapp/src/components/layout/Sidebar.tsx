import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/useAuthStore';
import { Home, Search, Disc, User, Music, BarChart2, Folder, Globe, LifeBuoy, LogIn, Settings } from 'lucide-react';
import clsx from 'clsx';

export const Sidebar = () => {
  const location = useLocation();
  const { user, isAuthenticated } = useAuthStore();
  
  const isActive = (path: string) => location.pathname === path || (path !== '/' && location.pathname.startsWith(path));

  const NavItem = ({ to, icon: Icon, label }: { to: string, icon: any, label: string }) => (
    <li>
      <Link 
        to={to} 
        className={clsx(
            "flex items-center gap-3 p-2 rounded-lg transition-colors", 
            isActive(to) ? "bg-primary/10 text-primary active" : "hover:bg-base-200"
        )}
      >
        <Icon size={20} />
        <span className="font-medium">{label}</span>
      </Link>
    </li>
  );

  return (
    <aside className="w-64 bg-black flex-col gap-2 p-2 hidden lg:flex shrink-0 border-r border-white/5 h-screen">
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 py-6 mb-2">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
             <Music className="text-white w-5 h-5" />
        </div>
        <span className="text-xl font-bold tracking-tight text-white">TuneCamp</span>
      </div>

      {/* Main Nav */}
      <ul className="menu bg-base-200/50 rounded-box w-full gap-1 p-2 font-medium">
        <NavItem to="/" icon={Home} label="Home" />
        <NavItem to="/search" icon={Search} label="Search" />
        <NavItem to="/network" icon={Globe} label="Network" />
      </ul>

      {/* Library Nav */}
      <div className="px-4 py-2 mt-4 opacity-50 text-xs font-bold uppercase tracking-wider">Your Library</div>
      <ul className="menu bg-base-200/50 rounded-box w-full gap-1 p-2 font-medium flex-1 overflow-y-auto">
        <NavItem to="/albums" icon={Disc} label="Albums" />
        <NavItem to="/artists" icon={User} label="Artists" />
        <NavItem to="/tracks" icon={Music} label="Tracks" />
        <NavItem to="/stats" icon={BarChart2} label="Stats" />
        {user?.isAdmin && <NavItem to="/browser" icon={Folder} label="Files" />}
        <div className="divider my-1"></div>
        <NavItem to="/support" icon={LifeBuoy} label="Support" />
      </ul>

      {/* User Footer */}
      <div className="p-4 border-t border-white/5 mt-auto">
        {isAuthenticated ? (
            <div className="flex items-center gap-3">
                <div className="avatar placeholder">
                    <div className="bg-neutral text-neutral-content rounded-full w-8">
                        <span>{user?.username?.charAt(0).toUpperCase()}</span>
                    </div>
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{user?.username}</p>
                    {user?.isAdmin && <span className="text-xs opacity-50">Admin</span>}
                </div>
                <Link to="/admin" className="btn btn-ghost btn-xs btn-circle">
                    <Settings size={16} />
                </Link>
            </div>
        ) : (
            <button className="btn btn-outline btn-sm w-full gap-2" onClick={() => document.dispatchEvent(new CustomEvent('open-auth-modal'))}>
                <LogIn size={16} /> Login
            </button>
        )}
      </div>
    </aside>
  );
};
