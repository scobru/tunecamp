import { confirm } from '@/utils/confirm';
import { useState, useEffect, useRef } from "react";
import API from "../../services/api";
import { notify } from "../../utils/notify";
import { Users, PowerOff, RefreshCw, Music, Activity } from "lucide-react";
import { StringUtils } from "../../utils/stringUtils";

export const PeerSessionsPanel = () => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const loadSessions = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await API.getPeerSessions();
      setSessions(data);
    } catch (e: any) {
      console.error(e);
      notify.error(e, "Failed to load peer sessions");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
    intervalRef.current = setInterval(() => {
      loadSessions(true);
    }, 5000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const handleKick = async (sessionId: string, username: string) => {
    if (!await confirm(`Are you sure you want to disconnect and kick the peer session for user "${username}"?`)) {
      return;
    }
    try {
      await API.kickPeerSession(sessionId);
      notify.success(`Kicked session for ${username}`);
      loadSessions(true);
    } catch (e: any) {
      notify.error(e, "Failed to kick session");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Activity className="text-primary animate-pulse" size={20} />
            Active Peer Sessions
          </h3>
          <p className="text-xs opacity-50 mt-1">
            Real-time list of connected peer-sharing daemons.
          </p>
        </div>
        <button
          className="btn btn-sm btn-ghost btn-circle"
          onClick={() => loadSessions()}
          disabled={loading}
          title="Refresh"
        >
          <RefreshCw className={loading ? "animate-spin text-primary" : ""} size={16} />
        </button>
      </div>

      {loading && sessions.length === 0 ? (
        <div className="p-12 text-center opacity-50 flex flex-col items-center gap-2">
          <Activity className="animate-spin text-primary" size={24} />
          Loading active peers...
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-12 opacity-50 border border-dashed border-base-content/10 rounded-2xl">
          <Users className="mx-auto opacity-30 mb-3" size={36} />
          <p className="text-sm font-semibold">No active peer sessions</p>
          <p className="text-xs opacity-60 mt-1">
            Connected CLI daemons will appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-base-200/30 rounded-2xl border border-base-content/5">
          <table className="table w-full">
            <thead>
              <tr>
                <th>User / Operator</th>
                <th>IP Address</th>
                <th>Connected</th>
                <th>Last Seen</th>
                <th className="text-center">Shared Tracks</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id} className="hover:bg-base-200/50 transition-colors">
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary">
                        {session.username?.charAt(0).toUpperCase() || "?"}
                      </div>
                      <div>
                        <div className="font-bold text-sm">{session.username || "Unknown"}</div>
                        <div className="text-[10px] opacity-40 font-mono select-all">Session: {session.id.substring(0, 8)}...</div>
                      </div>
                    </div>
                  </td>
                  <td className="font-mono text-xs opacity-70">{session.ip_address || "Unknown"}</td>
                  <td className="text-xs opacity-60">
                    {session.connected_at ? new Date(session.connected_at).toLocaleString() : "Unknown"}
                  </td>
                  <td className="text-xs">
                    {session.last_seen ? (
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-ping"></span>
                        <span className="opacity-75">{StringUtils.formatTimeAgo(session.last_seen)}</span>
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="text-center">
                    <div className="badge badge-accent badge-sm gap-1 font-semibold">
                      <Music size={10} />
                      {session.trackCount ?? 0}
                    </div>
                  </td>
                  <td className="text-right">
                    <button
                      className="btn btn-xs btn-error btn-outline gap-1 hover:bg-error"
                      onClick={() => handleKick(session.id, session.username)}
                    >
                      <PowerOff size={12} />
                      Disconnect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
