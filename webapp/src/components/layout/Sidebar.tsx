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
  Library,
  Wrench,
  ShoppingBag
} from "lucide-react";
import clsx from "clsx";
import { ThemeSwitcher } from "../ui/ThemeSwitcher";
import { WalletPill } from "../ui/WalletPill";

export const Sidebar = () => {
  const location = useLocation();
  const { user, isAuthenticated, role, logout } = useAuthStore();
  const [siteName, setSiteName] = useState("TuneCamp");
  const [siteLogo, setSiteLogo] = useState<string | null>(null);
  const [communityLink, setCommunityLink] = useState<string | null>(null);
 
  const isRoot = user?.isRootAdmin || role === 'root_admin';
  const isAdmin = role === 'admin' || isRoot || role === 'super_user';
  const isSuperUser = role === 'super_user';

  const getRoleLabel = (r: typeof role) => {
    switch (r) {
      case "root_admin":
        return "Root Admin";
      case "admin":
        return "Manager";
      case "super_user":
        return "Curator";
      case "user":
        return "Listener";
      default:
        return "Listener";
    }
  };

  const getRoleBadgeClass = (r: typeof role) => {
    switch (r) {
      case "root_admin":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      case "admin":
        return "bg-primary/10 text-primary border-primary/20";
      case "super_user":
        return "bg-secondary/10 text-secondary border-secondary/20";
      case "user":
      default:
        return "bg-base-content/5 text-base-content/60 border-base-content/10";
    }
  };
 
  useEffect(() => {
    API.getSiteSettings()
      .then((s) => {
        if (s.siteName) setSiteName(s.siteName);
        if (s.siteLogo) setSiteLogo(s.siteLogo);
        if (s.communityLink) setCommunityLink(s.communityLink);
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
          "flex items-center gap-3 px-4 py-2 rounded-full transition-all duration-medium-2 [transition-timing-function:var(--ease-spring)] group",
          isActive(to)
            ? "bg-primary text-primary-content font-bold shadow-level-1"
            : "hover:bg-base-300/50 text-base-content/70 hover:text-base-content",
        )}
      >
        <Icon size={20} className={clsx(
          "transition-transform group-hover:scale-110",
          isActive(to) ? "opacity-100" : "opacity-60"
        )} />
        <span className="text-label-large tracking-tight">{label}</span>
      </Link>
    </li>
  );

  const ExternalNavItem = ({
    href,
    icon: Icon,
    label,
  }: {
    href: string;
    icon: any;
    label: string;
  }) => (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 px-4 py-2 rounded-full transition-all duration-medium-2 [transition-timing-function:var(--ease-spring)] group hover:bg-base-300/50 text-base-content/70 hover:text-base-content"
      >
        <Icon size={20} className="transition-transform group-hover:scale-110 opacity-60 group-hover:opacity-100" />
        <span className="text-label-large tracking-tight">{label}</span>
      </a>
    </li>
  );
 
  return (
    <div className="w-64 min-h-full bg-base-200 text-base-content border-r border-base-content/10 flex flex-col gap-6 p-4 pb-32 overflow-y-auto">
      {/* Brand */}
      <div className="flex items-center gap-3 px-2 mb-4">
        <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center shadow-level-2 shadow-primary/20 bg-base-300">
          {siteLogo ? (
            <img src={siteLogo} alt={siteName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
              <Music className="text-primary-content w-6 h-6" />
            </div>
          )}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-xl font-black tracking-tighter uppercase leading-none break-words mb-1">{siteName}</span>
          <span className="text-[10px] font-bold opacity-50 uppercase tracking-widest">by tunecamp</span>
        </div>
      </div>
 
      {/* Main Nav */}
      <div className="space-y-6">
        <div>
          <h3 className="px-4 text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-3">Discover</h3>
          <ul className="menu menu-sm p-0 gap-1">
            <NavItem to="/" icon={Home} label="Home" />
            <NavItem to="/search" icon={Search} label="Search" />
            <NavItem to="/network" icon={Globe} label="Network" />
            <NavItem to="/store" icon={ShoppingBag} label="Store" />
            {communityLink && (
              <ExternalNavItem href={communityLink} icon={MessageSquare} label="Community" />
            )}
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
            {(isAdmin || isSuperUser || isRoot || !!user?.artistId) && (
              <NavItem to="/library" icon={Library} label="Library" />
            )}
            <NavItem to="/artists" icon={User} label="Artists" />
            <NavItem to="/tracks" icon={Music} label="Tracks" />
            <NavItem to="/playlists" icon={ListMusic} label="Playlists" />
            {isAuthenticated && (
              <NavItem to="/favorites" icon={Heart} label="Favorites" />
            )}
            {isAuthenticated && (
              <NavItem to="/my-playlists" icon={ListMusic} label="My Playlists" />
            )}
            <NavItem to="/stats" icon={BarChart2} label="Stats" />
          </ul>
        </div>

        {isAuthenticated && (isAdmin || !!user?.artistId) && (
          <div>
            <h3 className="px-4 text-[10px] font-black uppercase tracking-[0.2em] text-base-content/40 mb-3">Management</h3>
            <ul className="menu menu-sm p-0 gap-1">
              {isRoot && (
                <NavItem to="/browser" icon={Folder} label="Files" />
              )}
              {(isAdmin || !!user?.artistId) && (
                <>
                  <NavItem to="/publish" icon={Upload} label="Publish" />
                  <NavItem to="/my-music" icon={Music} label="My Music" />
                </>
              )}
              {(user?.artistId || isAdmin) && (
                <NavItem to="/social" icon={MessageSquare} label="Social" />
              )}
              {(isRoot || role === 'admin') && (
                <NavItem to="/search/content" icon={Globe} label="Search Content" />
              )}
            </ul>
          </div>
        )}
      </div>
 
      <div className="mt-auto space-y-4">
        <ul className="menu menu-sm p-0">
          <NavItem to="/support" icon={LifeBuoy} label="Support" />
          <NavItem to="/tools" icon={Wrench} label="Tools" />
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
                <div className="bg-neutral text-neutral-content rounded-xl w-10 ring-1 ring-base-content/10 cursor-pointer hover:ring-primary/50 transition-all duration-medium-2 [transition-timing-function:var(--ease-spring)] overflow-hidden">
                  {user?.avatar ? (
                    <img
                      src={user.avatar}
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
                <p className="text-sm font-bold truncate leading-snug">{user?.username || "User"}</p>
                <span className={clsx(
                  "inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border mt-0.5 shadow-sm transition-all duration-medium-1",
                  getRoleBadgeClass(role)
                )}>
                  {getRoleLabel(role)}
                </span>
              </div>

              <div className="flex gap-1">
                {(isRoot || isAdmin || isSuperUser) && (
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

