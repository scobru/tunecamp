import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { MainLayout } from "./components/layout/MainLayout";
import { lazy, Suspense, useEffect } from "react";
import { useAuthStore } from "./stores/useAuthStore";
import { useConfigStore } from "./stores/useConfigStore";
import { useSiteSettingsStore, type ModuleFlag } from "./stores/useSiteSettingsStore";
import { SetupWizardModal } from "./components/modals/SetupWizardModal";
import { ConfirmModal } from "./components/modals/ConfirmModal";
import { Toaster } from "react-hot-toast";


// Lazy-load all page components to reduce initial bundle size
const Home = lazy(() => import("./pages/Home"));
const Releases = lazy(() => import("./pages/Releases"));
const Archive = lazy(() => import("./pages/Archive"));
const Library = lazy(() => import("./pages/Library"));
const AlbumDetails = lazy(() => import("./pages/AlbumDetails"));
const Artists = lazy(() => import("./pages/Artists"));
const ArtistDetails = lazy(() => import("./pages/ArtistDetails"));
const Stats = lazy(() => import("./pages/Stats"));
const Search = lazy(() => import("./pages/Search"));
const Network = lazy(() => import("./pages/Network"));
const Support = lazy(() => import("./pages/Support"));
const PlaylistDetails = lazy(() => import("./pages/PlaylistDetails"));
const Post = lazy(() => import("./pages/Post")); // Special case
const Wallet = lazy(() => import("./pages/Wallet"));
const Profile = lazy(() => import("./pages/Profile"));
const UserProfile = lazy(() => import("./pages/UserProfile"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const ResetPasswordSecurity = lazy(() => import("./pages/ResetPasswordSecurity"));
const SsoCallback = lazy(() => import("./pages/SsoCallback"));
const MyMusic = lazy(() => import("./pages/MyMusic"));
const Publish = lazy(() => import("./pages/Publish"));
const Social = lazy(() => import("./pages/Social"));
const About = lazy(() => import("./pages/About"));
const Legal = lazy(() => import("./pages/Legal"));
const Guide = lazy(() => import("./pages/Guide"));
const Changelog = lazy(() => import("./pages/Changelog"));
const SharePage = lazy(() => import("./pages/SharePage"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminReleaseEditor = lazy(() => import("./pages/AdminReleaseEditor"));
const Files = lazy(() => import("./pages/Files"));
const Tools = lazy(() => import("./pages/Tools"));
const Store = lazy(() => import("./pages/Store"));
const Samples = lazy(() => import("./pages/Samples"));
const SamplePackDetail = lazy(() => import("./pages/SamplePackDetail"));
const Dig = lazy(() => import("./pages/Dig"));
const Lab = lazy(() => import("./pages/Lab"));
const LabApp = lazy(() => import("./pages/LabApp"));
const Live = lazy(() => import("./pages/Live"));
const RadioPage = lazy(() => import("./pages/Radio"));
const NowListening = lazy(() => import("./pages/NowListening"));
const Board = lazy(() => import("./pages/Board"));
const Collab = lazy(() => import("./pages/Collab"));
const CollabDetail = lazy(() => import("./pages/CollabDetail"));


const LoadingSpinner = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <span className="loading loading-spinner loading-lg text-primary"></span>
  </div>
);

/**
 * Guard component: only renders children if the user has correct role.
 * Otherwise redirects to home.
 */
function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading, role } = useAuthStore();
  
  if (isLoading) {
    return <LoadingSpinner />;
  }

  // Allow if user is explicitly a Root Admin OR if they have administrative roles
  if (!isAuthenticated || (!user?.isRootAdmin && role !== 'admin' && role !== 'super_user' && role !== 'root_admin')) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function RootAdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading, role } = useAuthStore();
  
  if (isLoading) {
    return <LoadingSpinner />;
  }

  const isRoot = user?.isRootAdmin || role === 'root_admin';
  if (!isAuthenticated || !isRoot) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}



function EditorGuard({ children }: { children: React.ReactNode }) {
  const { role, isAuthenticated, isLoading, user } = useAuthStore();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  const isEditor = role === 'admin' || role === 'super_user' || role === 'root_admin' || !!user?.artistId;
  if (!isAuthenticated || !isEditor) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

/**
 * Blocks a route when its module is disabled in admin "Customize Modules".
 * Hiding the sidebar link is not enough — without this guard the page still
 * loads by typing the URL. Server-side endpoints are guarded separately.
 */
function ModuleGuard({ flag, children }: { flag: ModuleFlag; children: React.ReactNode }) {
  const { flags, fetchFlags } = useSiteSettingsStore();

  useEffect(() => {
    if (!flags) fetchFlags();
  }, [flags, fetchFlags]);

  if (!flags) {
    return <LoadingSpinner />;
  }
  if (flags[flag]) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

/** Old bookmarks: /my-playlists/:id → unified /playlists/:id detail page. */
function LegacyMyPlaylistRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/playlists/${id}`} replace />;
}

function ArtistRedirect() {
  const { idOrSlug } = useParams<{ idOrSlug: string }>();
  return <Navigate to={`/artists/${idOrSlug}`} replace />;
}

function App() {
  const { init, checkAuth } = useAuthStore();
  const { fetchStatus } = useConfigStore();

  useEffect(() => {
    init().then(() => {
      if (useAuthStore.getState().isAdminAuthenticated) {
        fetchStatus();
      }
    });

    const handleUnauthorized = () => {
      checkAuth(); // Re-check auth on 401
    };

    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () =>
      window.removeEventListener("auth:unauthorized", handleUnauthorized);
  }, []);

  return (
    <>
      <SetupWizardModal />
      <ConfirmModal />
      <Toaster
        position="top-right"
        toastOptions={{
          className: "bg-base-200 text-base-content border border-base-content/10 shadow-level-3",
          style: {
            background: "var(--color-base-200)",
            color: "var(--color-base-content)",
            border: "1px solid color-mix(in srgb, var(--color-base-content) 10%, transparent)",
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-body-medium)",
            borderRadius: "var(--radius-field)",
          },
          success: {
            iconTheme: {
              primary: "oklch(65% 0.18 145)",
              secondary: "var(--color-base-200)",
            },
          },
          error: {
            iconTheme: {
              primary: "oklch(60% 0.2 30)",
              secondary: "var(--color-base-200)",
            },
          },
        }}
      />
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/changelog" element={<Changelog />} />
            <Route path="/terms" element={<Legal />} />
            <Route path="/privacy" element={<Legal />} />
            <Route path="/guide" element={<Guide />} />

            {/* Catalog & Library */}
            <Route path="/albums" element={<Releases />} />
            <Route path="/releases" element={<Releases />} />
            <Route path="/archive" element={<AdminGuard><Archive /></AdminGuard>} />
            <Route path="/library" element={<Library />} />
            <Route path="/albums/:idOrSlug" element={<AlbumDetails />} />
            <Route path="/releases/:idOrSlug" element={<AlbumDetails />} />
            <Route path="/releases/tracks" element={<Releases />} />
            <Route path="/artists" element={<Artists />} />
            <Route path="/artists/:idOrSlug" element={<ArtistDetails />} />
            <Route path="/@:idOrSlug" element={<ArtistRedirect />} />
            <Route path="/tracks" element={<Navigate to="/releases/tracks" replace />} />

            {/* Features */}
            <Route path="/search" element={<Search />} />
            <Route path="/playlists/:id" element={<PlaylistDetails />} />
            
            {/* Legacy Redirects */}
            <Route path="/playlists" element={<Navigate to="/library" replace />} />
            <Route path="/favorites" element={<Navigate to="/library?tab=tracks" replace />} />
            <Route path="/my-playlists" element={<Navigate to="/library" replace />} />
            <Route path="/my-playlists/:id" element={<LegacyMyPlaylistRedirect />} />

            {/* Purchased tracks view is now in the User Profile Collection tab */}
            <Route path="/post/:slug" element={<Post />} />
            <Route path="/network" element={<ModuleGuard flag="hideNetwork"><Network /></ModuleGuard>} />
            <Route path="/live" element={<ModuleGuard flag="hideLive"><Live /></ModuleGuard>} />
            <Route path="/radio" element={<RadioPage />} />
            <Route path="/now-listening" element={<NowListening />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/u/:username" element={<UserProfile />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/reset-password-security" element={<ResetPasswordSecurity />} />
            <Route path="/my-music" element={<MyMusic />} />
            <Route path="/publish" element={<Publish />} />
            <Route path="/social" element={<ModuleGuard flag="hideSocial"><Social /></ModuleGuard>} />
            <Route path="/board" element={<Board />} />
            <Route path="/share/:id" element={<SharePage />} />

            {/* Admin - Protected */}
            <Route path="/admin" element={<AdminGuard><Admin /></AdminGuard>} />
            <Route path="/admin/release/new" element={<EditorGuard><AdminReleaseEditor /></EditorGuard>} />
            <Route
              path="/admin/release/:id/edit"
              element={<EditorGuard><AdminReleaseEditor /></EditorGuard>}
            />
            <Route path="/browser" element={<RootAdminGuard><Files /></RootAdminGuard>} />

            {/* Store */}
            <Route path="/store" element={<ModuleGuard flag="hideStore"><Store /></ModuleGuard>} />
            <Route path="/samples" element={<ModuleGuard flag="hideSamples"><Samples /></ModuleGuard>} />
            <Route path="/samples/pack/:id" element={<ModuleGuard flag="hideSamples"><SamplePackDetail /></ModuleGuard>} />
            <Route path="/dig" element={<ModuleGuard flag="hideDig"><Dig /></ModuleGuard>} />


            {/* Lab */}
            <Route path="/lab" element={<ModuleGuard flag="hideLab"><Lab /></ModuleGuard>} />
            <Route path="/lab/:appId" element={<ModuleGuard flag="hideLab"><LabApp /></ModuleGuard>} />

            {/* Collab */}
            <Route path="/collab" element={<ModuleGuard flag="hideCollab"><Collab /></ModuleGuard>} />
            <Route path="/collab/:id" element={<ModuleGuard flag="hideCollab"><CollabDetail /></ModuleGuard>} />

            {/* Other */}
            <Route path="/support" element={<Support />} />
            <Route path="/tools" element={<Tools />} />
            
            <Route path="/auth/sso/callback" element={<SsoCallback />} />

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}

export default App;

