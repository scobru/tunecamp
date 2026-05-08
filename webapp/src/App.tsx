import { Routes, Route, Navigate } from "react-router-dom";
import { MainLayout } from "./components/layout/MainLayout";
import { lazy, Suspense, useEffect } from "react";
import { useAuthStore } from "./stores/useAuthStore";
import { useConfigStore } from "./stores/useConfigStore";
import { SetupWizardModal } from "./components/modals/SetupWizardModal";

// Lazy-load all page components to reduce initial bundle size
const Home = lazy(() => import("./pages/Home").then(m => ({ default: m.Home })));
const Releases = lazy(() => import("./pages/Releases").then(m => ({ default: m.Releases })));
const Library = lazy(() => import("./pages/Library").then(m => ({ default: m.Library })));
const AlbumDetails = lazy(() => import("./pages/AlbumDetails").then(m => ({ default: m.AlbumDetails })));
const Artists = lazy(() => import("./pages/Artists").then(m => ({ default: m.Artists })));
const ArtistDetails = lazy(() => import("./pages/ArtistDetails").then(m => ({ default: m.ArtistDetails })));
const Tracks = lazy(() => import("./pages/Tracks").then(m => ({ default: m.Tracks })));
const Stats = lazy(() => import("./pages/Stats").then(m => ({ default: m.Stats })));
const Search = lazy(() => import("./pages/Search").then(m => ({ default: m.Search })));
const Network = lazy(() => import("./pages/Network").then(m => ({ default: m.Network })));
const Support = lazy(() => import("./pages/Support").then(m => ({ default: m.Support })));
const Playlists = lazy(() => import("./pages/Playlists").then(m => ({ default: m.Playlists })));
const PlaylistDetails = lazy(() => import("./pages/PlaylistDetails").then(m => ({ default: m.PlaylistDetails })));
const MyPlaylists = lazy(() => import("./pages/MyPlaylists").then(m => ({ default: m.MyPlaylists })));
const MyPlaylistDetails = lazy(() => import("./pages/MyPlaylistDetails").then(m => ({ default: m.MyPlaylistDetails })));
const Post = lazy(() => import("./pages/Post").then(m => ({ default: m.PostPage })));
const Wallet = lazy(() => import("./pages/Wallet").then(m => ({ default: m.Wallet })));
const Profile = lazy(() => import("./pages/Profile").then(m => ({ default: m.Profile })));
const MyMusic = lazy(() => import("./pages/MyMusic").then(m => ({ default: m.MyMusic })));
const Social = lazy(() => import("./pages/Social").then(m => ({ default: m.Social })));
const About = lazy(() => import("./pages/About").then(m => ({ default: m.About })));
const SharePage = lazy(() => import("./pages/SharePage").then(m => ({ default: m.SharePage })));
const ContentSearch = lazy(() => import("./pages/ContentSearch").then(m => ({ default: m.ContentSearch })));
const Admin = lazy(() => import("./pages/Admin"));
const AdminReleaseEditor = lazy(() => import("./pages/AdminReleaseEditor"));
const Files = lazy(() => import("./pages/Files"));

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
    init();
    fetchStatus();

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
            <Route path="/my-music" element={<MyMusic />} />
            <Route path="/social" element={<Social />} />
            <Route path="/share/:id" element={<SharePage />} />

            {/* Admin - Protected: only role='admin' can access */}
            <Route path="/admin" element={<AdminGuard><Admin /></AdminGuard>} />
            <Route path="/admin/release/new" element={<EditorGuard><AdminReleaseEditor /></EditorGuard>} />
            <Route
              path="/admin/release/:id/edit"
              element={<EditorGuard><AdminReleaseEditor /></EditorGuard>}
            />
            <Route path="/browser" element={<AdminGuard><Files /></AdminGuard>} />

            <Route path="/search/content" element={<AdminGuard><ContentSearch /></AdminGuard>} />

            {/* Other */}
            <Route path="/support" element={<Support />} />

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}

export default App;

