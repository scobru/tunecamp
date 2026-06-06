import { useState, useEffect, useRef, useCallback } from "react";
import { useAuthStore } from "../stores/useAuthStore";
import { ZenLobby, type LobbyMessage } from "../services/zen";
import { PageHeader } from "../components/ui/PageHeader";
import { MessagesSquare, Send, Lock, ShieldCheck } from "lucide-react";
import clsx from "clsx";

const Lobby = () => {
  const { isAuthenticated, isInitializing } = useAuthStore();

  const [messages, setMessages] = useState<LobbyMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const myPub: string | undefined = undefined;

  const addMessage = useCallback((msg: LobbyMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg].sort((a, b) => a.ts - b.ts);
    });
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    let unsub: (() => void) | null = null;
    let cancelled = false;

    setConnecting(true);
    ZenLobby.subscribe(addMessage)
      .then((off) => {
        if (cancelled) { off(); return; }
        unsub = off;
        setError(null);
      })
      .catch((e) => {
        console.error("Lobby subscribe failed:", e);
        setError("Could not connect to the lobby.");
      })
      .finally(() => { if (!cancelled) setConnecting(false); });

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [isAuthenticated, addMessage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      await ZenLobby.send(text);
      setInput("");
    } catch (e: any) {
      setError(e?.message || "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (isInitializing) {
    return (
      <div className="p-12 text-center opacity-50 text-xl font-bold animate-pulse">
        Initializing...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="p-20 text-center animate-fade-in max-w-lg mx-auto bg-base-200/50 rounded-[3rem] border border-base-content/5 mt-10">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-8">
          <Lock size={40} className="text-primary" />
        </div>
        <h2 className="text-3xl font-black mb-4 tracking-tighter">Login Required</h2>
        <p className="opacity-60 mb-8 leading-relaxed">
          The lobby is an encrypted chat for registered members. Sign in to join the conversation.
        </p>
        <button
          className="btn btn-primary btn-lg px-12 rounded-2xl shadow-xl shadow-primary/20"
          onClick={() => document.dispatchEvent(new CustomEvent("open-auth-modal"))}
        >
          Login Now
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-20 flex flex-col h-[calc(100vh-9rem)]">
      <PageHeader
        title="Lobby"
        subtitle="Encrypted public chat for members"
        icon={MessagesSquare}
        iconColor="text-primary"
      />

      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest opacity-50">
        <ShieldCheck size={14} className="text-success" />
        Encrypted with the instance lobby key
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-base-200/30 rounded-[2rem] border border-base-content/5 backdrop-blur-sm p-4 md:p-6 space-y-3">
        {connecting ? (
          <div className="h-full flex items-center justify-center opacity-40 text-sm font-bold animate-pulse">
            Connecting to the lobby…
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-40 gap-3 text-center">
            <MessagesSquare size={40} />
            <p className="font-medium">No messages yet. Say hello 👋</p>
          </div>
        ) : (
          messages.map((m) => {
            const mine = !!myPub && m.pub === myPub;
            return (
              <div
                key={m.id}
                className={clsx("flex flex-col max-w-[80%] md:max-w-[60%]", mine ? "ml-auto items-end" : "items-start")}
              >
                <div className="flex items-baseline gap-2 px-1 mb-0.5">
                  <span className="text-[11px] font-black tracking-tight opacity-70">
                    {mine ? "You" : m.alias}
                  </span>
                  <span className="text-[9px] font-mono opacity-30">
                    {new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div
                  className={clsx(
                    "px-4 py-2 rounded-2xl text-sm leading-relaxed break-words whitespace-pre-wrap",
                    mine
                      ? "bg-primary text-primary-content rounded-tr-sm"
                      : "bg-base-300 text-base-content rounded-tl-sm"
                  )}
                >
                  {m.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="text-error text-xs font-bold px-2 -mt-2">{error}</div>
      )}

      {/* Composer */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          maxLength={2000}
          className="input input-bordered flex-1 rounded-2xl bg-base-200/50 focus:bg-base-100"
        />
        <button
          onClick={handleSend}
          disabled={sending || !input.trim()}
          className="btn btn-primary btn-circle shadow-lg shadow-primary/20"
          title="Send"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
};

export default Lobby;
