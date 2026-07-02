import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Heart, ListMusic, User, Disc, Palette, Settings } from "lucide-react";
import API, { type PublicProfile } from "../services/api";
import { useAuthStore } from "../stores/useAuthStore";

/**
 * Public listener profile at /u/:username. Shows only opt-in, public-safe data
 * (likes on public releases, public playlists, artist link). A private or
 * unknown user returns 404 -> we render a neutral "not available" state.
 */
const UserProfile = () => {
  const { username } = useParams();
  const { user: currentUser } = useAuthStore();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notAvailable, setNotAvailable] = useState(false);
  const isOwnProfile =
    !!currentUser?.username &&
    !!username &&
    currentUser.username.toLowerCase() === username.toLowerCase();

  useEffect(() => {
    if (!username) return;
    setLoading(true);
    setNotAvailable(false);
    API.getPublicProfile(username)
      .then(setProfile)
      .catch(() => setNotAvailable(true))
      .finally(() => setLoading(false));
  }, [username]);

  if (loading) {
    return <div className="p-12 text-center opacity-50">Loading profile...</div>;
  }

  if (notAvailable || !profile) {
    if (isOwnProfile) {
      // The viewer is looking at their own (private) profile: explain why it
      // 404s publicly and point them at the opt-in toggle instead of a dead end.
      return (
        <div className="p-12 text-center opacity-90 animate-fade-in max-w-md mx-auto">
          <User size={48} className="mx-auto mb-4 text-primary opacity-50" />
          <h2 className="text-xl font-bold mb-2">Your profile is private</h2>
          <p className="opacity-60 mb-6">
            This is your public profile page, but it's currently switched off, so
            visitors see "Profile not available". Enable "Public Profile" in your
            settings to make it visible here and on the network.
          </p>
          <Link to="/profile" className="btn btn-primary btn-sm gap-2">
            <Settings size={14} /> Open profile settings
          </Link>
        </div>
      );
    }
    return (
      <div className="p-12 text-center opacity-70 animate-fade-in max-w-md mx-auto">
        <User size={48} className="mx-auto mb-4 text-primary opacity-50" />
        <h2 className="text-xl font-bold mb-2">Profile not available</h2>
        <p className="opacity-60">
          This user doesn't exist or hasn't made their profile public.
        </p>
      </div>
    );
  }

  const displayName = profile.alias || profile.username;
  const roleLabel =
    profile.role === "root_admin" ? "Instance Owner"
    : profile.role === "admin" ? "Manager"
    : profile.role === "super_user" ? "Curator"
    : profile.artist ? "Community Artist"
    : "Listener";

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in pb-24 p-6 md:px-0 md:pt-0 md:pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-center gap-8 border-b border-base-content/10 pb-10">
        <div className="w-32 h-32 rounded-full overflow-hidden ring-4 ring-primary/20 bg-neutral flex items-center justify-center text-4xl font-black shrink-0">
          {profile.avatar ? (
            <img src={profile.avatar} alt={displayName} className="w-full h-full object-cover" />
          ) : (
            displayName.charAt(0).toUpperCase()
          )}
        </div>

        <div className="text-center md:text-left flex-1">
          <h1 className="text-4xl font-black tracking-tight mb-1">{displayName}</h1>
          <p className="opacity-40 text-sm mb-3">@{profile.username}</p>
          <div className="flex flex-wrap justify-center md:justify-start gap-3">
            <div className="badge badge-outline gap-2 py-3 px-4">{roleLabel}</div>
            <div className="badge badge-outline gap-2 py-3 px-4">
              <Heart size={14} className="text-primary" />
              {profile.stats.likes} Likes
            </div>
            <div className="badge badge-outline gap-2 py-3 px-4">
              <ListMusic size={14} className="text-secondary" />
              {profile.stats.playlists} Playlists
            </div>
            {profile.artist && (
              <Link
                to={`/artists/${profile.artist.slug}`}
                className="badge badge-primary gap-2 py-3 px-4 hover:badge-secondary transition-colors"
              >
                <Palette size={14} /> {profile.artist.name}
              </Link>
            )}
          </div>
          <p className="opacity-30 text-xs mt-3">
            Member since {new Date(profile.createdAt).toLocaleDateString()} - {profile.instance.name}
          </p>
        </div>
      </div>

      {/* Public playlists */}
      {profile.playlists.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <ListMusic size={20} className="text-secondary" /> Public Playlists
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {profile.playlists.map((p) => (
              <Link
                key={p.id}
                to={`/playlists/${p.id}`}
                className="card bg-base-200 border border-base-content/10 p-4 hover:border-primary/50 transition-all"
              >
                <div className="font-bold truncate">{p.name}</div>
                {p.description && (
                  <div className="text-sm opacity-50 line-clamp-2 mt-1">{p.description}</div>
                )}
                <div className="text-xs opacity-40 mt-2">{p.trackCount} tracks</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Liked public releases */}
      {profile.likes.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Heart size={20} className="text-primary" /> Likes
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {profile.likes.map((l, i) => (
              <a
                key={i}
                href={l.url || "#"}
                className="group"
              >
                <div className="aspect-square w-full rounded-xl overflow-hidden bg-gradient-to-br from-primary/30 to-purple-800/60 flex items-center justify-center border border-base-content/10 group-hover:border-primary/50 transition-all">
                  {l.cover ? (
                    <img src={l.cover} alt={l.title} className="w-full h-full object-cover" />
                  ) : (
                    <Disc size={32} className="opacity-40" />
                  )}
                </div>
                <div className="mt-2 text-sm font-semibold truncate group-hover:text-primary transition-colors">
                  {l.title}
                </div>
                {l.artist && <div className="text-xs opacity-40 truncate">{l.artist}</div>}
              </a>
            ))}
          </div>
        </section>
      )}

      {profile.playlists.length === 0 && profile.likes.length === 0 && (
        <div className="p-16 text-center opacity-40 bg-base-200/50 rounded-3xl border border-dashed border-base-content/20">
          Nothing public to show yet.
        </div>
      )}
    </div>
  );
};

export default UserProfile;
