import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuthStore } from "../../stores/useAuthStore";
import { useUIStore } from "../../stores/useUIStore";
import { useSiteSettingsStore } from "../../stores/useSiteSettingsStore";
import {
  Home,
  Search,
  Disc,
  User,
  Music,
  BarChart2,
  Folder,
  Archive,
  Globe,
  LifeBuoy,
  LogIn,
  Settings,
  LogOut,
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
  Scale,
  MoreHorizontal,
  Sparkles,
  Music2,
  Users,
} from "lucide-react";
import clsx from "clsx";
import { ThemeSwitcher } from "../ui/ThemeSwitcher";
import { LanguageSwitcher } from "../ui/LanguageSwitcher";
import { WalletPill } from "../ui/WalletPill";
import { canPublish } from "../../utils/permissions";
import { getRoleLabel, getRoleBadgeClass } from "../../utils/roles";

export const Sidebar = () => {
  const location = useLocation();
  const { user, isAuthenticated, role, logout } = useAuthStore();
  const { sidebarCollapsed, toggleSidebarCollapsed } = useUIStore();
  const { settings, fetchFlags, isModuleHidden } = useSiteSettingsStore();
  const siteName = settings?.siteName || "TuneCamp";
  const siteLogo = settings?.siteLogo || null;
  const communityLink = settings?.communityLink || null;
  const hideLive = isModuleHidden("hideLive");
  const hideStore = isModuleHidden("hideStore");
  const hideSocial = isModuleHidden("hideSocial");
  const hideNetwork = isModuleHidden("hideNetwork");
  const hideSamples = isModuleHidden("hideSamples");
  const hideDig = isModuleHidden("hideDig");
  const hideCollab = isModuleHidden("hideCollab");
  const hideLab = isModuleHidden("hideLab");

  const isRoot = user?.isRootAdmin || role === 'root_admin';
  const isAdmin = role === 'admin' || isRoot || role === 'super_user';
  const isSuperUser = role === 'super_user';
  // Publishing access follows the artist-profile link, not the role, so
  // self-publish listeners (role 'user' + artistId) get the Studio section.
  const canPub = canPublish(user, role);


  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

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
            <span className={clsx("text-label-large", active ? "font-semibold tracking-tight" : "font-medium tracking-normal")}>{label}</span>
          )}
        </Link>
      </li>
    );
  };

  const SectionHeader = ({ label }: { label: string }) => {
    if (sidebarCollapsed) return <div className="border-t border-base-content/10 mx-2 my-2" />;
    return <h3 className="px-4 text-[10px] font-semibold tracking-widest uppercase text-base-content/35 mb-2">{label}</h3>;
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
              <img src="/logo.svg" alt="TuneCamp" className="w-full h-full object-cover" />
            )}
          </div>
          {!sidebarCollapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-lg font-bold tracking-tight leading-none break-words mb-1">{siteName}</span>
              <span className="text-[11px] font-medium opacity-40 tracking-wide">by tunecamp</span>
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
          <ul className="menu menu-sm p-0 gap-1">
            <NavItem to="/" icon={Home} label="Home" />
            <NavItem to="/search" icon={Search} label="Search" />
            {isAuthenticated && <NavItem to="/library" icon={Library} label="Library" />}
          </ul>
        </div>

        <div>
          <SectionHeader label="Explore" />
          <ul className="menu menu-sm p-0 gap-1">
            <NavItem to="/releases" icon={Disc} label="Releases" />
            <NavItem to="/artists" icon={User} label="Artists" />
            <NavItem to="/radio" icon={Rss} label="Radio" />
            {!hideLive && <NavItem to="/live" icon={Radio} label="Live" />}
            {!hideStore && <NavItem to="/store" icon={ShoppingBag} label="Store" />}
            {!hideSamples && <NavItem to="/samples" icon={Music2} label="Samples" />}
            <li>
              <details>
                <summary className={clsx(
                  "flex items-center transition-all duration-300 [transition-timing-function:var(--ease-spring)] group",
                  sidebarCollapsed
                    ? "justify-center w-10 h-10 mx-auto rounded-xl p-0"
                    : "gap-3 px-4 py-2 rounded-full",
                  "hover:bg-base-300/50 text-base-content/70 hover:text-base-content"
                )}>
                  <MoreHorizontal size={20} className="flex-shrink-0 transition-transform group-hover:scale-110 opacity-60" />
                  {!sidebarCollapsed && <span className="text-label-large font-medium tracking-normal">More</span>}
                </summary>
                <ul className={clsx(sidebarCollapsed ? "hidden" : "")}>
                  {!hideDig && <NavItem to="/dig" icon={Shovel} label="Dig" />}
                  {!hideLab && <NavItem to="/lab" icon={FlaskConical} label="Lab" />}
                  {!hideCollab && <NavItem to="/collab" icon={Users} label="Collab" />}
                </ul>
              </details>
            </li>
          </ul>
        </div>

        <div>
          <SectionHeader label="Community" />
          <ul className="menu menu-sm p-0 gap-1">
            {!hideNetwork && <NavItem to="/network" icon={Globe} label="Network" />}
            <NavItem to="/board" icon={MessageSquare} label="Board" />
            {isAuthenticated && <NavItem to="/now-listening" icon={Headphones} label="Now Listening" />}
            {isAuthenticated && <NavItem to="/stats" icon={BarChart2} label="Stats" />}
          </ul>
        </div>

        {isAuthenticated && (canPub || isAdmin) && (
          <div>
            <SectionHeader label="Studio" />
            <ul className="menu menu-sm p-0 gap-1">
              <NavItem to="/publish" icon={Upload} label="Publish" />
              {!!user?.artistId && !hideSocial && (
                <NavItem to="/social" icon={MessageSquare} label="Social" />
              )}
              <NavItem to="/my-music" icon={Music} label="My Catalog" />
              {isAdmin && (
                <NavItem to="/archive" icon={Archive} label="Archive" />
              )}
            </ul>
          </div>
        )}
      </div>

      <div className={clsx(
        "pt-4 border-t border-base-content/5 w-full mt-auto",
        sidebarCollapsed ? "space-y-2" : "space-y-4"
      )}>
        {!sidebarCollapsed && !isAuthenticated && (
          <div className="px-2 space-y-2">
            <ThemeSwitcher />
            <LanguageSwitcher />
          </div>
        )}

        {isAuthenticated ? (
          <div className="dropdown dropdown-top w-full">
            <div
              role="button"
              tabIndex={0}
              className={clsx(
                "flex items-center gap-3 hover:bg-base-300/50 transition-colors cursor-pointer rounded-2xl",
                sidebarCollapsed ? "flex-col p-1 justify-center" : "p-2"
              )}
            >
              <div className="avatar placeholder flex-shrink-0">
                <div className="bg-neutral text-neutral-content rounded-xl w-9 ring-1 ring-base-content/10 cursor-pointer overflow-hidden">
                  {user?.avatar ? (
                    <img src={user.avatar} alt={user.username || ""} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs font-bold">
                      {(user?.username || (isAdmin ? "A" : "U"))?.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
              </div>

              {!sidebarCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate leading-snug">{user?.username || "User"}</p>
                  <span className={clsx(
                    "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-black tracking-normal border mt-0.5 shadow-sm transition-all duration-medium-1",
                    getRoleBadgeClass(role, !!user?.artistId)
                  )}>
                    {getRoleLabel(role, !!user?.artistId)}
                  </span>
                </div>
              )}
            </div>

            <ul tabIndex={0} className="dropdown-content z-[60] menu p-2 shadow-level-1 bg-base-300 rounded-2xl w-60 border border-base-content/10 mb-2">
              <div className="px-2 pb-2 space-y-2">
                <ThemeSwitcher />
                <LanguageSwitcher />
              </div>
              <div className="divider my-0 opacity-10"></div>

              {(isRoot || isAdmin || isSuperUser) && (
                <li>
                  <details>
                    <summary className="font-bold"><Settings size={16} /> Admin</summary>
                    <ul>
                      <li><Link to="/admin"><Settings size={16} /> Settings</Link></li>
                      {isRoot && <li><Link to="/browser"><Folder size={16} /> Files</Link></li>}
                    </ul>
                  </details>
                </li>
              )}

              <li className="menu-title mt-2 text-[11px]">Settings</li>
              <li><Link to="/profile"><User size={16} /> Profile</Link></li>
              <li><Link to="/tools"><Wrench size={16} /> Tools</Link></li>

              <div className="divider my-1 opacity-10"></div>
              <li className="menu-title mt-2 text-[11px]">Resources</li>
              <li><Link to="/guide"><BookOpen size={16} /> Guide</Link></li>
              <li><Link to="/support"><LifeBuoy size={16} /> Support</Link></li>
              <li><Link to="/terms"><Scale size={16} /> Legal</Link></li>
              <li><Link to="/about"><Info size={16} /> About</Link></li>
              <li><Link to="/changelog"><Sparkles size={16} /> Changelog</Link></li>
              <li><a href="/feed.xml" target="_blank" rel="noopener noreferrer"><Rss size={16} /> RSS Feed</a></li>
              {communityLink && (
                <li><a href={communityLink} target="_blank" rel="noopener noreferrer"><MessageSquare size={16} /> Community</a></li>
              )}

              <div className="divider my-1 opacity-10"></div>
              <li>
                <a onClick={handleLogout} className="text-error">
                  <LogOut size={16} /> Logout
                </a>
              </li>
            </ul>
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
          <div className="mt-2 px-2">
            <WalletPill />
          </div>
        )}
      </div>
    </div>
  );
};
