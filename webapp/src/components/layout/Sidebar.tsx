import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuthStore } from "../../stores/useAuthStore";
import API from "../../services/api";
import {
  Home,
  Search,
  Disc,
  User,
  Music,
  BarChart2,
  Folder,
  Globe,
  LifeBuoy,
  LogIn,
  Settings,
  ListMusic,
  LogOut,
  Heart,
  Upload,
  MessageSquare,
  Library
} from "lucide-react";
import clsx from "clsx";
import { ThemeSwitcher } from "../ui/ThemeSwitcher";
import { WalletPill } from "../ui/WalletPill";

export const Sidebar = () => {
  const location = useLocation();
  const { user, isAuthenticated, role, logout } = useAuthStore();
  const [siteName, setSiteName] = useState("TuneCamp");
  const [siteLogo, setSiteLogo] = useState<string | null>(null);
 
  const isAdmin = role === 'admin' || role === 'root_admin' || role === 'super_user';
  const isSuperUser = role === 'super_user';
  const isUser = role === 'user';
 
  useEffect(() => {
    API.getSiteSettings()
      .then((s) => {
        if (s.siteName) setSiteName(s.siteName);
        if (s.siteLogo) setSiteLogo(s.siteLogo);
      })
      .catch(console.error);
  }, []);
 
  const handleLogout = () => {
    logout();
  };
 
  const isActive = (path: string) =>
    location.pathname === path ||
    (path !== "/" && location.pathname.startsWith(path));
 
  const NavItem = ({
    to,
    icon: Icon,
    label,
  }: {
    to: string;
    icon: any;
    label: string;
  }) => (
    <li>
      <Link
        to={to}
        aria-current={isActive(to) ? "page" : undefined}
        className={clsx(
          "flex items-center gap-3 px-4 py-2 rounded-lg transition-all duration-200 group",
          isActive(to)
            ? "bg-primary text-primary-content font-bold shadow-md shadow-primary/20"
            : "hover:bg-base-300/50 text-base-content/70 hover:text-base-content",
        )}
      >
        <Icon size={20} className={clsx(
          "transition-transform group-hover:scale-110",
          isActive(to) ? "opacity-100" : "opacity-60"
        )} />
        <span className="text-sm tracking-tight">{label}</span>
      </Link>
    </li>
  );
 
  return (
    <div className="menu p-4 w-64 min-h-full bg-base-200/30 backdrop-blur-xl text-base-content border-r border-base-content/5 flex flex-col gap-6 pb-28">
      {/* Brand */}
      <div className="flex items-center gap-3 px-2 mb-4">
        <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center shadow-lg shadow-primary/20 bg-base-300">
          {siteLogo ? (
            <img src={siteLogo} alt={siteName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
              <Music className="text-primary-content w-6 h-6" />
            </div>
          )}
        </div>
        <span className="text-xl font-black tracking-tighter uppercase">{siteName}</span>
      </div>
 
      {/* Main Nav */}
      <div className="space-y-6">
        <div>
          <h3 className="px-4 text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-3">Discover</h3>
          <ul className="menu menu-sm p-0 gap-1">
            <NavItem to="/" icon={Home} label="Home" />
            <NavItem to="/search" icon={Search} label="Search" />
            <NavItem to="/network" icon={Globe} label="Network" />
          </ul>
        </div>
 
        <div>
          <h3 className="px-4 text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-3">Catalog</h3>
          <ul className="menu menu-sm p-0 gap-1">
            <NavItem to="/albums" icon={Disc} label="Releases" />
          </ul>
        </div>

        <div>
          <h3 className="px-4 text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-3">Collection</h3>
          <ul className="menu menu-sm p-0 gap-1">
            {(isAdmin || isSuperUser || user?.isRootAdmin || !!user?.artistId) && (
              <NavItem to="/library" icon={Library} label="Library" />
            )}
            <NavItem to="/artists" icon={User} label="Artists" />
            <NavItem to="/tracks" icon={Music} label="Tracks" />
            <NavItem to="/playlists" icon={ListMusic} label="Playlists" />
            {isAuthenticated && (
              <NavItem to="/my-playlists" icon={Heart} label="My Playlists" />
            )}
            <NavItem to="/stats" icon={BarChart2} label="Stats" />
          </ul>
        </div>

        {isAuthenticated && (user?.isRootAdmin || isAdmin || isSuperUser || isUser) && (
          <div>
            <h3 className="px-4 text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-3">Management</h3>
            <ul className="menu menu-sm p-0 gap-1">
              {user?.isRootAdmin && (
                <NavItem to="/browser" icon={Folder} label="Files" />
              )}
              {(user?.isRootAdmin || isAdmin || isSuperUser) && (
                <NavItem to="/my-music" icon={Upload} label="My Music" />
              )}
              {(user?.isRootAdmin || isAdmin || isSuperUser) && (user?.artistId || user?.isRootAdmin) && (
                <NavItem to="/social" icon={MessageSquare} label="Social" />
              )}
              {user?.isRootAdmin && (
                <NavItem to="/search/content" icon={Globe} label="Search Content" />
              )}
            </ul>
          </div>
        )}
      </div>
 
      <div className="mt-auto space-y-4">
        <ul className="menu menu-sm p-0">
          <NavItem to="/support" icon={LifeBuoy} label="Support" />
        </ul>

        {/* User Footer */}
        <div className="pt-4 border-t border-base-content/5 w-full space-y-4">
          <div className="px-2">
            <ThemeSwitcher />
          </div>
          
          {isAuthenticated ? (
            <div className="flex items-center gap-3 px-2">
              <Link
                to="/profile"
                className="avatar placeholder"
              >
                <div className="bg-neutral text-neutral-content rounded-lg w-10 ring-1 ring-base-content/10 cursor-pointer hover:ring-primary/50 transition-all overflow-hidden">
                  {user?.zenProfile?.profile?.avatar ? (
                    <img
                      src={user.zenProfile.profile.avatar}
                      alt={user.username || ""}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs font-bold">
                      {(user?.username || (isAdmin ? "A" : "U"))
                        ?.charAt(0)
                        .toUpperCase()}
                    </span>
                  )}
                </div>
              </Link>
              
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{user?.username || "User"}</p>
                <p className="text-[10px] opacity-50 uppercase tracking-widest">{role}</p>
              </div>

              <div className="flex gap-1">
                {(user?.isRootAdmin || isAdmin || isSuperUser) && (
                  <Link
                    to="/admin"
                    className="btn btn-ghost btn-xs btn-square opacity-60 hover:opacity-100"
                  >
                    <Settings size={14} />
                  </Link>
                )}
                <button
                  className="btn btn-ghost btn-xs btn-square opacity-60 hover:opacity-100 hover:text-error"
                  onClick={handleLogout}
                >
                  <LogOut size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="px-2">
              <button
                className="btn btn-primary btn-block btn-sm"
                onClick={() =>
                  document.dispatchEvent(new CustomEvent("open-auth-modal"))
                }
              >
                <LogIn size={16} />
                Login
              </button>
            </div>
          )}
          {isAuthenticated && (
            <div className="mt-4 px-2">
               <WalletPill />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

