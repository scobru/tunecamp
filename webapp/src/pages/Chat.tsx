import { useState, useEffect, useRef } from "react";
import { usePeerChat } from "../hooks/usePeerChat";
import { PageHeader } from "../components/ui/PageHeader";
import { useSiteSettingsStore, truthy } from "../stores/useSiteSettingsStore";
import { useAuthStore } from "../stores/useAuthStore";
import { MessageCircle, Send, Lock, AlertCircle, Globe } from "lucide-react";
import clsx from "clsx";

const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function Chat() {
  const { settings: siteSettings, fetchFlags } = useSiteSettingsStore();
  const { role } = useAuthStore();
  const isAdmin = role === 'admin' || role === 'root_admin' || role === 'super_user';
  const [to, setTo] = useState("");
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  const isChatEnabled = truthy(siteSettings?.peerChatEnabled);
  const { messages, status, username, sendMessage } = usePeerChat(isChatEnabled);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!sendMessage(to.trim(), text.trim())) return;
    setText("");
  };

  if (!siteSettings) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 opacity-50">
        <span className="loading loading-spinner loading-lg text-primary"></span>
        <p className="text-sm font-medium">Loading chat...</p>
      </div>
    );
  }

  if (!isChatEnabled && !isAdmin) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 text-center bg-base-200/50 rounded-3xl border border-base-content/5 glass-effect space-y-4">
        <div className="w-16 h-16 rounded-full bg-warning/10 text-warning flex items-center justify-center mx-auto">
          <AlertCircle size={32} />
        </div>
        <h2 className="text-xl font-bold">Chat Disabled</h2>
        <p className="text-sm opacity-60">
          Peer chat is currently disabled by the site administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <PageHeader
        title="Peer Chat"
        subtitle="Talk to everyone in the lobby, or send an encrypted message to one peer."
        icon={MessageCircle}
        iconColor="text-primary"
        gradientFrom="from-primary/20"
        gradientTo="to-primary/5"
      />

      {!isChatEnabled && isAdmin && (
        <div className="alert alert-warning py-3 rounded-2xl shadow-m3-1 flex items-center gap-3">
          <AlertCircle size={20} className="shrink-0" />
          <div className="text-xs font-semibold">
            Peer chat is disabled for this instance. Only you can see this page.
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 text-xs">
        <span
          className={clsx("badge badge-sm gap-1", {
            "badge-success": status === "online",
            "badge-warning": status === "connecting",
            "badge-ghost": status === "offline",
          })}
        >
          {status}
        </span>
        {username && <span className="opacity-60">connected as {username}</span>}
      </div>

      <div className="bg-base-200/50 rounded-3xl border border-base-content/5 glass-effect overflow-hidden">
        <div className="h-[55vh] overflow-y-auto p-4 space-y-2">
          {messages.length === 0 && (
            <p className="text-sm opacity-50 text-center py-8">
              Nothing here yet. Say hello to the lobby.
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={`${m.ts}-${i}`}
              className={clsx("flex gap-2 items-baseline text-sm", m.self && "opacity-70")}
            >
              <span className="opacity-40 text-xs shrink-0">{formatTime(m.ts)}</span>
              <span className="font-semibold shrink-0">{m.from}</span>
              {m.e2e ? (
                <Lock size={12} className="text-success shrink-0" aria-label="End-to-end encrypted" />
              ) : (
                <Globe size={12} className="opacity-30 shrink-0" aria-label="Lobby" />
              )}
              <span className="break-words">{m.text}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-base-content/5 p-3 flex flex-col sm:flex-row gap-2">
          <input
            className="input input-sm input-bordered rounded-xl sm:w-48"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="Peer username (empty = lobby)"
          />
          <input
            className="input input-sm input-bordered rounded-xl flex-1"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            maxLength={2000}
            placeholder={status === "online" ? "Message..." : "Connecting..."}
            disabled={status !== "online"}
          />
          <button
            className="btn btn-sm btn-primary rounded-xl gap-2"
            onClick={handleSend}
            disabled={status !== "online" || !text.trim()}
          >
            <Send size={14} /> Send
          </button>
        </div>
      </div>

      <p className="text-xs opacity-50">
        Lobby messages are stored on this instance and visible to everyone connected.
        Direct messages are end-to-end encrypted and never stored — the server only relays them.
      </p>
    </div>
  );
}
