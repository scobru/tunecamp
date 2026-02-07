import { Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from './components/layout/MainLayout';
import { Home, Albums, AlbumDetails, Artists, ArtistDetails, Tracks, Stats, Search, Network, Support, Playlists, PlaylistDetails, Post } from './pages';
import Admin from './pages/Admin';
import Files from './pages/Files';
import { useAuthStore } from './stores/useAuthStore';
import { useEffect } from 'react';

// Temporary Support page if not exists
// const SupportPlaceholder = () => <div className="p-8 text-center text-xl opacity-50">Support & Documentation coming soon.</div>;

function App() {
  const { init, checkAdminAuth } = useAuthStore();

  useEffect(() => {
    init();
    
    const handleUnauthorized = () => {
        checkAdminAuth(); // Re-check admin auth on 401
    };
    
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Home />} />
        
        {/* Library */}
        <Route path="/albums" element={<Albums />} />
        <Route path="/albums/:id" element={<AlbumDetails />} />
        <Route path="/artists" element={<Artists />} />
        <Route path="/artists/:id" element={<ArtistDetails />} />
        <Route path="/tracks" element={<Tracks />} />
        
        {/* Features */}
        <Route path="/search" element={<Search />} />
        <Route path="/playlists" element={<Playlists />} />
        <Route path="/playlists/:id" element={<PlaylistDetails />} />
        <Route path="/post/:slug" element={<Post />} />
        <Route path="/network" element={<Network />} />
        <Route path="/stats" element={<Stats />} />
        
        {/* Admin */}
        <Route path="/admin" element={<Admin />} />
        <Route path="/admin/tracks" element={<AdminTracks />} />
        <Route path="/browser" element={<Files />} />
        
        {/* Other */}
        <Route path="/support" element={<Support />} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
