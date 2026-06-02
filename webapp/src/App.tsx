import { Routes, Route, Navigate } from "react-router-dom";
import { MainLayout } from "./components/layout/MainLayout";
import { lazy, Suspense, useEffect } from "react";
import { useAuthStore } from "./stores/useAuthStore";
import { useConfigStore } from "./stores/useConfigStore";
import { SetupWizardModal } from "./components/modals/SetupWizardModal";

// Lazy-load all page components to reduce initial bundle size
const Home = lazy(() => import("./pages/Home"));
const Releases = lazy(() => import("./pages/Releases"));
const Library = lazy(() => import("./pages/Library"));
const AlbumDetails = lazy(() => import("./pages/AlbumDetails"));
const Artists = lazy(() => import("./pages/Artists"));
const ArtistDetails = lazy(() => import("./pages/ArtistDetails"));
const Tracks = lazy(() => import("./pages/Tracks"));
const Stats = lazy(() => import("./pages/Stats"));
const Search = lazy(() => import("./pages/Search"));
const Network = lazy(() => import("./pages/Network"));
const Support = lazy(() => import("./pages/Support"));
const Playlists = lazy(() => import("./pages/Playlists"));
const PlaylistDetails = lazy(() => import("./pages/PlaylistDetails"));
const MyPlaylists = lazy(() => import("./pages/MyPlaylists"));
const MyPlaylistDetails = lazy(() => import("./pages/MyPlaylistDetails"));
const Post = lazy(() => import("./pages/Post")); // Special case
const Wallet = lazy(() => import("./pages/Wallet"));
const Profile = lazy(() => import("./pages/Profile"));
const MyMusic = lazy(() => import("./pages/MyMusic"));
const Social = lazy(() => import("./pages/Social"));
const About = lazy(() => import("./pages/About"));
const SharePage = lazy(() => import("./pages/SharePage"));
const ContentSearch = lazy(() => import("./pages/ContentSearch"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminReleaseEditor = lazy(() => import("./pages/AdminReleaseEditor"));
const Files = lazy(() => import("./pages/Files"));
const Favorites = lazy(() => import("./pages/Favorites"));
const Tools = lazy(() => import("./pages/Tools"));


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

function ManagerOrRootGuard({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading, role } = useAuthStore();
  
  if (isLoading) {
    return <LoadingSpinner />;
  }

  const isRoot = user?.isRootAdmin || role === 'root_admin';
  const isManager = role === 'admin';
  if (!isAuthenticated || (!isRoot && !isManager)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function EditorGuard({ children }: { children: React.ReactNode }) {
  const { role, isAuthenticated, isLoading } = useAuthStore();
  
  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated || (role !== 'admin' && role !== 'user' && role !== 'super_user' && role !== 'root_admin')) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
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
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />

            {/* Catalog & Library */}
            <Route path="/albums" element={<Releases />} />
            <Route path="/releases" element={<Releases />} />
            <Route path="/library" element={<Library />} />
            <Route path="/albums/:idOrSlug" element={<AlbumDetails />} />
            <Route path="/releases/:idOrSlug" element={<AlbumDetails />} />
            <Route path="/artists" element={<Artists />} />
            <Route path="/artists/:idOrSlug" element={<ArtistDetails />} />
            <Route path="/tracks" element={<Tracks />} />

            {/* Features */}
            <Route path="/search" element={<Search />} />
            <Route path="/playlists" element={<Playlists />} />
            <Route path="/playlists/:id" element={<PlaylistDetails />} />
            <Route path="/my-playlists" element={<MyPlaylists />} />
            <Route path="/my-playlists/:id" element={<MyPlaylistDetails />} />
            {/* Purchased tracks view is now in the User Profile Collection tab */}
            <Route path="/post/:slug" element={<Post />} />
            <Route path="/network" element={<Network />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/my-music" element={<MyMusic />} />
            <Route path="/social" element={<Social />} />
            <Route path="/share/:id" element={<SharePage />} />

            {/* Admin - Protected */}
            <Route path="/admin" element={<AdminGuard><Admin /></AdminGuard>} />
            <Route path="/admin/release/new" element={<EditorGuard><AdminReleaseEditor /></EditorGuard>} />
            <Route
              path="/admin/release/:id/edit"
              element={<EditorGuard><AdminReleaseEditor /></EditorGuard>}
            />
            <Route path="/browser" element={<RootAdminGuard><Files /></RootAdminGuard>} />

            <Route path="/search/content" element={<ManagerOrRootGuard><ContentSearch /></ManagerOrRootGuard>} />

            {/* Other */}
            <Route path="/support" element={<Support />} />
            <Route path="/tools" element={<Tools />} />

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}

export default App;

