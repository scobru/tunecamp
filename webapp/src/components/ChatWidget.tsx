import React, { useState, useEffect, useRef } from "react";
import { useChat } from "../hooks/useChat";
import { useAuthStore } from "../stores/useAuthStore";
import { 
  X, 
  MessageSquare, 
  Lock, 
  Volume2, 
  VolumeX, 
  SendHorizontal,
  Info
} from "lucide-react";
import clsx from "clsx";

interface ChatWidgetProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChatWidget: React.FC<ChatWidgetProps> = ({ isOpen, onClose }) => {
  const { messages, isLoading, error, sendMessage } = useChat();
  const { user, isAuthenticated } = useAuthStore();
  
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Auto-scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  // Audio beep sound generator (synthesized dynamically - no file asset needed!)
  const playNotificationSound = () => {
    if (!soundEnabled) return;
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {
      console.warn("Audio Context playback failed:", e);
    }
  };

  // Play sound when new message from others arrives
  const prevMessagesLength = useRef(messages.length);
  useEffect(() => {
    if (messages.length > prevMessagesLength.current) {
      const lastMsg = messages[messages.length - 1];
      // Only play beep if it's from another user and chat is open
      if (lastMsg && lastMsg.username !== user?.username && isOpen) {
        playNotificationSound();
      }
    }
    prevMessagesLength.current = messages.length;
  }, [messages, isOpen, user]);

  // Handle ESC key close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isSending || !isAuthenticated) return;

    setIsSending(true);
    try {
      await sendMessage(inputText.trim());
      setInputText("");
    } catch (err: any) {
      alert(err.message || "Failed to send message");
    } finally {
      setIsSending(false);
    }
  };

  const insertEmoji = (emoji: string) => {
    setInputText((prev) => prev + emoji);
  };

  const getRoleBadge = (msgRole: string, source: 'webapp' | 'telegram') => {
    if (source === 'telegram') {
      return (
        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-[#229ED9]/10 text-[#229ED9] border border-[#229ED9]/20 shadow-sm flex items-center gap-0.5">
          Telegram
        </span>
      );
    }

    switch (msgRole) {
      case "root_admin":
        return (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-error/15 text-error border border-error/20 shadow-sm">
            Root Admin
          </span>
        );
      case "admin":
        return (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-primary/15 text-primary border border-primary/20 shadow-sm">
            Manager
          </span>
        );
      case "super_user":
        return (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-secondary/15 text-secondary border border-secondary/20 shadow-sm">
            Curator
          </span>
        );
      case "user":
      default:
        return (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-base-content/5 text-base-content/60 border border-base-content/10 shadow-sm">
            Listener
          </span>
        );
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return "";
    }
  };

  return (
    <>
      {/* Backdrop overlay */}
      <div 
        className={clsx(
          "fixed inset-0 bg-base-300/40 backdrop-blur-sm z-[90] transition-opacity duration-300",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Slide-out Chat Panel */}
      <div 
        className={clsx(
          "fixed right-0 top-0 bottom-0 w-full sm:w-[450px] bg-base-200/90 backdrop-blur-xl border-l border-base-content/10 shadow-2xl z-[100] flex flex-col transition-transform duration-300 ease-out transform",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="p-4 border-b border-base-content/10 flex items-center justify-between bg-base-100/50 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-sm border border-primary/20">
              <MessageSquare size={18} />
            </div>
            <div>
              <h3 className="font-extrabold text-base tracking-tight leading-tight">Community Chat</h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse shadow-sm shadow-success/50" />
                <span className="text-[10px] opacity-60 font-semibold tracking-tight uppercase">Telegram Bridge Active</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Audio Toggle */}
            <button 
              className={clsx(
                "btn btn-square btn-ghost btn-sm text-base-content/60 hover:text-base-content hover:bg-base-content/5",
                soundEnabled && "text-primary hover:text-primary"
              )}
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? "Disable Notification Beep" : "Enable Notification Beep"}
            >
              {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>

            {/* Close Button */}
            <button 
              className="btn btn-square btn-ghost btn-sm text-base-content/60 hover:text-base-content hover:bg-base-content/5"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Message Log */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
          {isLoading && messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 opacity-50">
              <span className="loading loading-spinner loading-md text-primary"></span>
              <p className="text-xs font-bold">Loading messages...</p>
            </div>
          ) : error ? (
            <div className="alert alert-error text-xs shadow-sm py-3 px-4 rounded-xl border border-error/20 flex items-center gap-2">
              <Info size={14} className="shrink-0" />
              <span>{error}</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-8 opacity-45 space-y-3">
              <div className="w-12 h-12 rounded-full bg-base-content/5 border border-base-content/10 flex items-center justify-center">
                <MessageSquare size={24} />
              </div>
              <div>
                <p className="text-sm font-bold">No messages yet</p>
                <p className="text-xs leading-relaxed mt-1">Start the conversation! Messages will also mirror to our Telegram group chat.</p>
              </div>
            </div>
          ) : (
            messages.map((msg, index) => {
              const isMe = msg.username === user?.username && msg.source === 'webapp';
              
              return (
                <div 
                  key={msg.id || index} 
                  className={clsx(
                    "chat animate-fade-in", 
                    isMe ? "chat-end" : "chat-start"
                  )}
                >
                  <div className="chat-image avatar placeholder">
                    <div className="w-8 rounded-lg bg-neutral text-neutral-content ring-1 ring-base-content/10 flex items-center justify-center text-xs font-black select-none">
                      {msg.username.charAt(0).toUpperCase()}
                    </div>
                  </div>
                  
                  <div className="chat-header flex items-center gap-1.5 mb-1 flex-wrap">
                    <span className="font-bold text-xs leading-none">{msg.username}</span>
                    {getRoleBadge(msg.role, msg.source)}
                  </div>

                  <div 
                    className={clsx(
                      "chat-bubble text-sm leading-relaxed max-w-[280px] sm:max-w-[320px] break-words shadow-sm font-medium py-2 px-3.5 rounded-2xl",
                      isMe 
                        ? "bg-primary text-primary-content rounded-tr-none font-semibold shadow-primary/10" 
                        : "bg-base-300 text-base-content rounded-tl-none border border-base-content/5"
                    )}
                  >
                    {msg.message}
                  </div>
                  
                  <div className="chat-footer opacity-50 text-[10px] mt-1 font-semibold">
                    {formatTime(msg.created_at)}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Form Footer */}
        <div className="p-4 border-t border-base-content/10 bg-base-100/50 backdrop-blur-md">
          {isAuthenticated ? (
            <form onSubmit={handleSend} className="space-y-3">
              {/* Emojis row */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none select-none">
                {["🔥", "👍", "👏", "😂", "❤️", "🎵", "🙌", "💥"].map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="w-7 h-7 flex items-center justify-center text-sm rounded-lg hover:bg-base-content/10 active:scale-95 transition-all duration-short-2 bg-base-300/40 border border-base-content/5"
                    onClick={() => insertEmoji(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              <div className="relative flex items-center">
                <input
                  type="text"
                  placeholder="Say something to the community..."
                  className="input input-bordered w-full pr-12 rounded-xl text-sm h-11 bg-base-200/50 border-base-content/10 focus:border-primary focus:bg-base-200 focus:outline-none transition-all"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  maxLength={500}
                  disabled={isSending}
                />
                <button
                  type="submit"
                  className={clsx(
                    "absolute right-1.5 btn btn-circle btn-primary btn-sm shadow-md",
                    isSending && "loading"
                  )}
                  disabled={!inputText.trim() || isSending}
                >
                  {!isSending && <SendHorizontal size={14} />}
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-col items-center justify-center p-3 text-center bg-base-300/40 border border-base-content/5 rounded-2xl gap-3">
              <div className="flex items-center gap-2 text-xs font-bold opacity-60">
                <Lock size={14} className="text-secondary" />
                <span>You must be logged in to participate in the chat</span>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm btn-block rounded-xl shadow-sm gap-2"
                onClick={() => {
                  onClose();
                  document.dispatchEvent(new CustomEvent("open-auth-modal"));
                }}
              >
                Login or Sign Up
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
