import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuthStore } from "../../stores/useAuthStore";
import { useUIStore } from "../../stores/useUIStore";
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
  ShoppingBag,
  Shovel,
  Radio,
  Headphones,
  Rss,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  Info,
} from "lucide-react";
import clsx from "clsx";
import { ThemeSwitcher } from "../ui/ThemeSwitcher";
import { WalletPill } from "../ui/WalletPill";
import { canPublish } from "../../utils/permissions";

export const Sidebar = () => {
  const location = useLocation();
  const { user, isAuthenticated, role, logout } = useAuthStore();
  const { sidebarCollapsed, toggleSidebarCollapsed } = useUIStore();
  const [siteName, setSiteName] = useState("TuneCamp");
  const [siteLogo, setSiteLogo] = useState<string | null>(null);
  const [communityLink, setCommunityLink] = useState<string | null>(null);
  const [hideLive, setHideLive] = useState(false);
  const [hideStore, setHideStore] = useState(false);
  const [hideSocial, setHideSocial] = useState(false);
  const [hideNetwork, setHideNetwork] = useState(false);
  const [hideDig, setHideDig] = useState(false);

  const isRoot = user?.isRootAdmin || role === 'root_admin';
  const isAdmin = role === 'admin' || isRoot || role === 'super_user';
  const isSuperUser = role === 'super_user';
  // Publishing access follows the artist-profile link, not the role, so
  // self-publish listeners (role 'user' + artistId) get the Studio section.
  const canPub = canPublish(user, role);

  const getRoleLabel = (r: typeof role) => {
    switch (r) {
      case "root_admin": return "Root Admin";
      case "admin": return "Manager";
      case "super_user": return "Curator";
      case "user": return user?.artistId ? "Artist" : "Listener";
      default: return "Listener";
    }
  };

  const getRoleBadgeClass = (r: typeof role) => {
    switch (r) {
      case "root_admin": return "bg-red-500/10 text-red-500 border-red-500/20";
      case "admin": return "bg-primary/10 text-primary border-primary/20";
      case "super_user": return "bg-secondary/10 text-secondary border-secondary/20";
      case "user":
        if (user?.artistId) return "bg-accent/10 text-accent border-accent/20";
        return "bg-base-content/5 text-base-content/60 border-base-content/10";
      default: return "bg-base-content/5 text-base-content/60 border-base-content/10";
    }
  };

  useEffect(() => {
    API.getSiteSettings()
      .then((s) => {
        if (s.siteName) setSiteName(s.siteName);
        if (s.siteLogo) setSiteLogo(s.siteLogo);
        if (s.communityLink) setCommunityLink(s.communityLink);
        setHideLive(s.hideLive === true || s.hideLive === "true");
        setHideStore(s.hideStore === true || s.hideStore === "true");
        setHideSocial(s.hideSocial === true || s.hideSocial === "true");
        setHideNetwork(s.hideNetwork === true || s.hideNetwork === "true");
        setHideDig(s.hideDig === true || s.hideDig === "true");
      })
      .catch(console.error);
  }, []);

  const handleLogout = () => logout();

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
  }) => {
    const active = isActive(to);
    return (
      <li>
        <Link
          to={to}
          title={sidebarCollapsed ? label : undefined}
          aria-current={active ? "page" : undefined}
          className={clsx(
            "flex items-center transition-all duration-300 [transition-timing-function:var(--ease-spring)] group",
            sidebarCollapsed
              ? "justify-center w-10 h-10 mx-auto rounded-xl p-0"
              : "gap-3 px-4 py-2 rounded-full",
            active
              ? "bg-primary text-primary-content font-bold shadow-level-1"
              : "hover:bg-base-300/50 text-base-content/70 hover:text-base-content",
          )}
        >
          <Icon size={20} className={clsx(
            "flex-shrink-0 transition-transform group-hover:scale-110",
            active ? "opacity-100" : "opacity-60"
          )} />
          {!sidebarCollapsed && (
            <span className="text-label-large tracking-tight">{label}</span>
          )}
        </Link>
      </li>
    );
  };

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
        title={sidebarCollapsed ? label : undefined}
        className={clsx(
          "flex items-center transition-all duration-300 [transition-timing-function:var(--ease-spring)] group",
          sidebarCollapsed
            ? "justify-center w-10 h-10 mx-auto rounded-xl p-0"
            : "gap-3 px-4 py-2 rounded-full",
          "hover:bg-base-300/50 text-base-content/70 hover:text-base-content"
        )}
      >
        <Icon size={20} className="flex-shrink-0 transition-transform group-hover:scale-110 opacity-60 group-hover:opacity-100" />
        {!sidebarCollapsed && (
          <span className="text-label-large tracking-tight">{label}</span>
        )}
      </a>
    </li>
  );

  const SectionHeader = ({ label }: { label: string }) => {
    if (sidebarCollapsed) return <div className="border-t border-base-content/10 mx-2 my-2" />;
    return <h3 className="px-4 text-xs font-black tracking-[0.2em] text-base-content/40 mb-3">{label}</h3>;
  };

  return (
    <div
      className={clsx(
        "min-h-full bg-base-200 text-base-content border-r border-base-content/10 flex flex-col gap-6 pb-32 overflow-y-auto overflow-x-hidden",
        "transition-[width,padding] duration-300 ease-in-out",
        sidebarCollapsed ? "w-16 p-2" : "w-64 p-4"
      )}
    >
      {/* Brand + Toggle */}
      <div className={clsx(
        "flex items-center mb-4",
        sidebarCollapsed ? "flex-col gap-2 pt-2" : "gap-3 px-2 justify-between"
      )}>
        <div className={clsx(
          "flex items-center gap-3 min-w-0",
          sidebarCollapsed && "justify-center"
        )}>
          <div className="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center shadow-level-2 shadow-primary/20 bg-base-300">
            {siteLogo ? (
              <img src={siteLogo} alt={siteName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                <Music className="text-primary-content w-5 h-5" />
              </div>
            )}
          </div>
          {!sidebarCollapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-xl font-black tracking-tighter leading-none break-words mb-1">{siteName}</span>
              <span className="text-xs font-bold opacity-50 tracking-normal">by tunecamp</span>
            </div>
          )}
        </div>

        <button
          onClick={toggleSidebarCollapsed}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="btn btn-ghost btn-xs btn-square opacity-40 hover:opacity-100 flex-shrink-0 hidden lg:flex"
        >
          {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Main Nav */}
      <div className="space-y-5 flex-1">
        <div>
          <SectionHeader label="Discover" />
          <ul className="menu menu-sm p-0 gap-1">
            <NavItem to="/" icon={Home} label="Home" />
            <NavItem to="/search" icon={Search} label="Search" />
            {!hideNetwork && <NavItem to="/network" icon={Globe} label="Network" />}
            {!hideLive && <NavItem to="/live" icon={Radio} label="Live" />}
            <NavItem to="/radio" icon={Rss} label="Radio" />
            {isAuthenticated && <NavItem to="/now-listening" icon={Headphones} label="Now Listening" />}
            {!hideStore && <NavItem to="/store" icon={ShoppingBag} label="Store" />}
            <NavItem to="/board" icon={MessageSquare} label="Board" />
          </ul>
        </div>

        <div>
          <SectionHeader label="Catalog" />
          <ul className="menu menu-sm p-0 gap-1">
            <NavItem to="/albums" icon={Disc} label="Releases" />
            <NavItem to="/artists" icon={User} label="Artists" />
            <NavItem to="/tracks" icon={Music} label="Tracks" />
          </ul>
        </div>

        {isAuthenticated && (
          <div>
            <SectionHeader label="My Music" />
            <ul className="menu menu-sm p-0 gap-1">
              <NavItem to="/playlists" icon={ListMusic} label="Playlists" />
              <NavItem to="/favorites" icon={Heart} label="Favorites" />
              <NavItem to="/stats" icon={BarChart2} label="Stats" />
            </ul>
          </div>
        )}

        <div>
          <SectionHeader label="Lab" />
          <ul className="menu menu-sm p-0 gap-1">
            <NavItem to="/lab" icon={FlaskConical} label="Lab" />
            {isAuthenticated && !hideDig && (
              <NavItem to="/dig" icon={Shovel} label="Dig" />
            )}
          </ul>
        </div>

        {isAuthenticated && canPub && (
          <div>
            <SectionHeader label="Studio" />
            <ul className="menu menu-sm p-0 gap-1">
              <NavItem to="/publish" icon={Upload} label="Publish" />
              <NavItem to="/my-music" icon={Music} label="My Catalog" />
              {!!user?.artistId && !hideSocial && (
                <NavItem to="/social" icon={MessageSquare} label="Social" />
              )}
              {/* Archive = full private library; admin-only. Self-publish
                  listeners can publish but cannot browse the private library. */}
              {isAdmin && (
                <NavItem to="/library" icon={Library} label="Archive" />
              )}
              {(isRoot || role === 'admin') && (
                <NavItem to="/search/content" icon={Globe} label="Search Content" />
              )}
              {isRoot && (
                <NavItem to="/browser" icon={Folder} label="Files" />
              )}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-auto space-y-4">
        <ul className="menu menu-sm p-0">
          {(isRoot || isAdmin || isSuperUser) && (
            <NavItem to="/admin" icon={Settings} label="Settings" />
          )}
          <NavItem to="/about" icon={Info} label="About" />
          <NavItem to="/guide" icon={BookOpen} label="Guide" />
          <NavItem to="/support" icon={LifeBuoy} label="Support" />
          <NavItem to="/tools" icon={Wrench} label="Tools" />
          <ExternalNavItem href="/feed.xml" icon={Rss} label="RSS Feed" />
          {communityLink && (
            <ExternalNavItem href={communityLink} icon={MessageSquare} label="Community" />
          )}
        </ul>

        {/* User Footer */}
        <div className={clsx(
          "pt-4 border-t border-base-content/5 w-full",
          sidebarCollapsed ? "space-y-2" : "space-y-4"
        )}>
          {!sidebarCollapsed && (
            <div className="px-2">
              <ThemeSwitcher />
            </div>
          )}

          {isAuthenticated ? (
            <div className={clsx(
              "flex items-center gap-3",
              sidebarCollapsed ? "flex-col px-0" : "px-2"
            )}>
              <Link to="/profile" className="avatar placeholder flex-shrink-0">
                <div className="bg-neutral text-neutral-content rounded-xl w-9 ring-1 ring-base-content/10 cursor-pointer hover:ring-primary/50 transition-all duration-medium-2 [transition-timing-function:var(--ease-spring)] overflow-hidden">
                  {user?.avatar ? (
                    <img src={user.avatar} alt={user.username || ""} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs font-bold">
                      {(user?.username || (isAdmin ? "A" : "U"))?.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
              </Link>

              {!sidebarCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate leading-snug">{user?.username || "User"}</p>
                  <span className={clsx(
                    "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-black tracking-normal border mt-0.5 shadow-sm transition-all duration-medium-1",
                    getRoleBadgeClass(role)
                  )}>
                    {getRoleLabel(role)}
                  </span>
                </div>
              )}

              {!sidebarCollapsed && (
                <div className="flex gap-1">
                  <button
                    className="btn btn-ghost btn-xs btn-square opacity-60 hover:opacity-100 hover:text-error"
                    onClick={handleLogout}
                  >
                    <LogOut size={14} />
                  </button>
                </div>
              )}

              {sidebarCollapsed && (
                <div className="flex flex-col gap-1 items-center">
                  <button
                    title="Logout"
                    className="btn btn-ghost btn-xs btn-square opacity-60 hover:opacity-100 hover:text-error"
                    onClick={handleLogout}
                  >
                    <LogOut size={14} />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className={clsx(sidebarCollapsed ? "flex justify-center" : "px-2")}>
              {sidebarCollapsed ? (
                <button
                  title="Login"
                  className="btn btn-primary btn-xs btn-square"
                  onClick={() => document.dispatchEvent(new CustomEvent("open-auth-modal"))}
                >
                  <LogIn size={14} />
                </button>
              ) : (
                <button
                  className="btn btn-primary btn-block btn-sm"
                  onClick={() => document.dispatchEvent(new CustomEvent("open-auth-modal"))}
                >
                  <LogIn size={16} />
                  Login
                </button>
              )}
            </div>
          )}

          {isAuthenticated && !sidebarCollapsed && (
            <div className="mt-4 px-2">
              <WalletPill />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
