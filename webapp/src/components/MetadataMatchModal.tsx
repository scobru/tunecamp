import React, { useState } from "react";
import { Search, Music, User, Book, Check, X, Loader2 } from "lucide-react";
import API from "../services/api";

interface MetadataMatch {
  id: string;
  title: string;
  artist: string;
  albumTitle?: string;
  coverUrl?: string;
  source?: "musicbrainz" | "discogs" | "itunes";
  date?: string;
  genre?: string;
  year?: string | number;
  description?: string;
}

interface MetadataMatchModalProps {
  item: any;
  type: "track" | "album";
  onClose: () => void;
  onMatched: (updatedItem: any) => void;
}

export const MetadataMatchModal: React.FC<MetadataMatchModalProps> = ({
  item,
  type,
  onClose,
  onMatched,
}) => {
  const [query, setQuery] = useState(item.title || "");
  const [results, setResults] = useState<MetadataMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [matching, setMatching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;

    setSearching(true);
    setError(null);
    try {
      const data = type === "track" 
        ? await API.searchTrackMetadata(query) 
        : await API.searchAlbumMetadata(query);
      setResults(data);
    } catch (err: any) {
      setError(err.message || "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const handleMatch = async (match: MetadataMatch) => {
    setMatching(match.id);
    setError(null);
    try {
      if (type === "track") {
        const payload: any = {
          artist: match.artist,
          albumTitle: match.albumTitle,
          coverUrl: match.coverUrl,
          mbid: match.id,
          source: match.source
        };

        if (match.source !== "discogs") {
          payload.title = match.title;
        }

        const response = await API.matchTrackMetadata(item.id, payload);
        onMatched(response.track);
      } else {
        // Album match
        const payload: any = {
          title: match.title,
          artist: match.artist,
          coverUrl: match.coverUrl,
          genre: match.genre,
          year: match.year,
          description: match.description,
          source: match.source
        };

        const response = await API.matchAlbumMetadata(item.id, payload);
        onMatched(response.album);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || "Match failed");
      setMatching(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-base-300 w-full max-w-2xl rounded-2xl border border-base-content/10 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="p-6 border-b border-base-content/10 flex items-center justify-between bg-base-content/5">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Music className="text-primary" /> Match Metadata
          </h2>
          <button onClick={onClose} className="btn btn-ghost btn-sm btn-circle">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50"
                size={18}
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for track/artist..."
                className="input input-bordered pl-10 w-full bg-base-200"
                autoFocus
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={searching}
            >
              {searching ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                "Search"
              )}
            </button>
          </form>

          {error && (
            <div className="alert alert-error text-sm py-2">{error}</div>
          )}

          <div className="space-y-3">
            {results.length > 0 ? (
              results.map((match) => (
                <div
                  key={match.id}
                  className="flex items-center gap-4 p-4 rounded-xl bg-base-content/5 hover:bg-base-content/10 border border-transparent hover:border-base-content/10 transition-all group"
                >
                  <div className="w-12 h-12 rounded-lg bg-base-100 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                    {match.coverUrl ? (
                      <img
                        src={match.coverUrl}
                        alt="Cover"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Music className="opacity-20" size={24} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-bold truncate group-hover:text-primary transition-colors">
                        {match.title}
                      </div>
                      {match.source && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border uppercase font-bold tracking-wider ${
                          match.source === 'discogs' 
                            ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' 
                            : 'bg-primary/10 text-primary border-primary/20'
                        }`}>
                          {match.source}
                        </span>
                      )}
                    </div>
                    <div className="text-sm opacity-60 flex items-center flex-wrap gap-x-3 gap-y-1 mt-0.5">
                      <span className="flex items-center gap-1">
                        <User size={12} /> {match.artist}
                      </span>
                      {match.albumTitle && (
                        <span className="flex items-center gap-1 truncate max-w-[200px]">
                          <Book size={12} /> {match.albumTitle}
                        </span>
                      )}
                      {match.date && (
                        <span className="text-xs opacity-50">
                          ({match.date.substring(0, 4)})
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleMatch(match)}
                    disabled={matching !== null}
                    className="btn btn-primary btn-sm gap-2"
                  >
                    {matching === match.id ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      <>
                        <Check size={16} /> Match
                      </>
                    )}
                  </button>
                </div>
              ))
            ) : query && !searching ? (
              <div className="text-center py-12 opacity-50 text-sm">
                {results.length === 0 && !searching
                  ? "No results found. Try a different query."
                  : "Search for a track to see results."}
              </div>
            ) : null}
          </div>
        </div>

        <div className="p-4 bg-base-200/50 text-[10px] uppercase tracking-wider opacity-30 text-center">
          Data provided by MusicBrainz, Discogs, and iTunes API
        </div>
      </div>
    </div>
  );
};

