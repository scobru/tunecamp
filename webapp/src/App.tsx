import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from './components/layout/MainLayout';
import { Home } from './pages/Home';
import { useAuthStore } from './stores/useAuthStore';
import { useEffect } from 'react';

// Placeholders for now
const Albums = () => <div className="p-8"><h1 className="text-3xl font-bold">Albums</h1></div>;
const Artists = () => <div className="p-8"><h1 className="text-3xl font-bold">Artists</h1></div>;
const Tracks = () => <div className="p-8"><h1 className="text-3xl font-bold">Tracks</h1></div>;
const Stats = () => <div className="p-8"><h1 className="text-3xl font-bold">Stats</h1></div>;

function App() {
  const { checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <Router>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/albums" element={<Albums />} />
          <Route path="/artists" element={<Artists />} />
          <Route path="/tracks" element={<Tracks />} />
          <Route path="/stats" element={<Stats />} />
          {/* Add other routes */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
