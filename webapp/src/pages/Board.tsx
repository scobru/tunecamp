import { useState, useEffect } from "react";
import { useChat } from "../hooks/useChat";
import { useAuthStore } from "../stores/useAuthStore";
import { PageHeader } from "../components/ui/PageHeader";
import { StringUtils } from "../utils/stringUtils";
import API from "../services/api";
import type { SiteSettings } from "../types";
import {
  MessageSquare,
  Send,
  Lock,
  Clock,
  Trash2,
  Sparkles,
  AlertCircle
} from "lucide-react";
import clsx from "clsx";

// Simple color helper based on username hash to assign consistent, attractive colors to placeholder avatars
const getAvatarColorClass = (username: string) => {
  const colors = [
    "bg-primary/20 text-primary border-primary/20",
    "bg-secondary/20 text-secondary border-secondary/20",
    "bg-accent/20 text-accent border-accent/20",
    "bg-info/20 text-info border-info/20",
    "bg-success/20 text-success border-success/20",
    "bg-warning/20 text-warning border-warning/20",
    "bg-error/20 text-error border-error/20",
  ];
  
  if (!username) return colors[0];
  
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
};

const getRoleLabel = (role: string) => {
  switch (role) {
    case "root_admin":
      return "Root Admin";
    case "admin":
      return "Manager";
    case "super_user":
      return "Curator";
    default:
      return "Listener";
  }
};

const getRoleBadgeClass = (role: string) => {
  switch (role) {
    case "root_admin":
      return "bg-red-500/10 text-red-400 border-red-500/20";
    case "admin":
      return "bg-primary/10 text-primary border-primary/20";
    case "super_user":
      return "bg-secondary/10 text-secondary border-secondary/20";
    default:
      return "bg-base-content/5 text-base-content/60 border-base-content/10";
  }
};

const Board = () => {
  const { messages, isLoading, error, sendMessage, deleteMessage } = useChat();
  const { user, isAuthenticated, role } = useAuthStore();
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  
  const [messageText, setMessageText] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const isAdmin = role === 'admin' || role === 'root_admin' || role === 'super_user';

  const handleDelete = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this message?")) return;
    try {
      await deleteMessage(id);
    } catch (err: any) {
      alert(err.message || "Failed to delete message");
    }
  };

  // Load site settings to check if the board is enabled
  useEffect(() => {
    API.getSiteSettings()
      .then((s) => {
        setSiteSettings(s);
      })
      .catch((err) => {
        console.error("Failed to load site settings", err);
      })
      .finally(() => {
        setLoadingSettings(false);
      });
  }, []);

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) return;

    setIsPosting(true);
    setPostError(null);

    try {
      await sendMessage(messageText.trim());
      setMessageText("");
    } catch (err: any) {
      setPostError(err.message || "Failed to post message. Please try again.");
    } finally {
      setIsPosting(false);
    }
  };

  if (loadingSettings || (isLoading && messages.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 opacity-50">
        <span className="loading loading-spinner loading-lg text-primary"></span>
        <p className="text-sm font-medium">Loading community board...</p>
      </div>
    );
  }

  const isBoardEnabled =
    siteSettings?.chatEnabled === true ||
    siteSettings?.chatEnabled === "true";

  // If the board is disabled, only admins can see and interact with it
  if (!isBoardEnabled && !isAdmin) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 text-center bg-base-200/50 rounded-3xl border border-base-content/5 glass-effect space-y-4">
        <div className="w-16 h-16 rounded-full bg-warning/10 text-warning flex items-center justify-center mx-auto">
          <AlertCircle size={32} />
        </div>
        <h2 className="text-xl font-bold">Board Disabled</h2>
        <p className="text-sm opacity-60">
          The community message board is currently disabled by the site administrator. Please check back later.
        </p>
      </div>
    );
  }

  // Reverse chronological order: newest at the top
  const orderedMessages = [...messages].reverse();

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <PageHeader
        title="Community Board"
        subtitle="Leave a message, share your thoughts, or say hello to the artist!"
        icon={MessageSquare}
        iconColor="text-primary"
        gradientFrom="from-primary/20"
        gradientTo="to-primary/5"
      />

      {!isBoardEnabled && isAdmin && (
        <div className="alert alert-warning py-3 rounded-2xl shadow-m3-1 flex items-center gap-3">
          <AlertCircle size={20} className="shrink-0" />
          <div className="text-xs font-semibold">
            Note: The message board is currently set as disabled in settings. You are seeing this page because you are an Administrator.
          </div>
        </div>
      )}

      {error && (
        <div className="alert alert-error py-3 rounded-2xl shadow-m3-1 flex items-center gap-3">
          <AlertCircle size={20} className="shrink-0" />
          <div className="text-xs font-semibold">{error}</div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Posting form (First on mobile via order class, right column on desktop) */}
        <div className="lg:col-span-1 lg:order-last space-y-6">
          <div className="card card-m3 bg-base-200/40 border border-base-content/5 glass-effect p-6 rounded-3xl space-y-4 sticky top-6">
            <h3 className="font-black text-lg flex items-center gap-2 tracking-tight">
              <Sparkles size={18} className="text-primary" />
              Sign the Board
            </h3>
            
            {isAuthenticated ? (
              <form onSubmit={handlePost} className="space-y-4">
                <div className="form-control">
                  <textarea
                    className="textarea textarea-bordered bg-base-300/30 w-full min-h-[120px] text-base rounded-2xl border-base-content/10 focus:outline-none focus:border-primary p-4 resize-none transition-all"
                    placeholder="Write your message here..."
                    maxLength={500}
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    disabled={isPosting}
                  />
                  <div className="flex justify-between items-center px-1 mt-1 text-[11px] opacity-40 font-bold">
                    <span>Max 500 characters</span>
                    <span>{messageText.length}/500</span>
                  </div>
                </div>

                {postError && (
                  <p className="text-xs text-error font-semibold flex items-center gap-1.5">
                    <AlertCircle size={14} />
                    {postError}
                  </p>
                )}

                <button
                  type="submit"
                  className="btn btn-primary btn-block rounded-xl gap-2 font-bold shadow-level-1 hover:scale-[1.01] active:scale-[0.99] transition-all"
                  disabled={isPosting || !messageText.trim()}
                >
                  {isPosting ? (
                    <span className="loading loading-spinner loading-xs"></span>
                  ) : (
                    <Send size={16} />
                  )}
                  Post Message
                </button>
              </form>
            ) : (
              <div className="text-center py-6 space-y-4">
                <div className="w-12 h-12 rounded-full bg-base-content/5 text-base-content/40 flex items-center justify-center mx-auto">
                  <Lock size={20} />
                </div>
                <p className="text-xs font-semibold opacity-60 leading-relaxed px-4">
                  You must be logged in to post messages on the board.
                </p>
                <button
                  className="btn btn-primary btn-sm rounded-lg px-6"
                  onClick={() =>
                    document.dispatchEvent(new CustomEvent("open-auth-modal"))
                  }
                >
                  Log In
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Messages Feed (Left column on desktop) */}
        <div className="lg:col-span-2 space-y-4">
          {orderedMessages.length > 0 ? (
            <div className="space-y-4">
              {orderedMessages.map((msg, index) => {
                const isMe = user?.username === msg.username;
                const avatarColor = getAvatarColorClass(msg.username);
                const canDelete = isMe || isAdmin;
                
                return (
                  <div
                    key={msg.id || index}
                    className="card card-m3 bg-base-200/20 border border-base-content/5 p-5 rounded-3xl flex flex-row gap-4 hover:bg-base-200/40 transition-colors duration-medium-1"
                  >
                    {/* User Avatar Placeholder */}
                    <div className="flex-shrink-0">
                      <div className={clsx(
                        "w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg border shadow-sm select-none",
                        avatarColor
                      )}>
                        {msg.username.charAt(0).toUpperCase()}
                      </div>
                    </div>

                    {/* Message Details */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center flex-wrap gap-2">
                        <span className="font-extrabold text-sm tracking-tight truncate max-w-[150px] sm:max-w-none text-prominent">
                          {msg.username}
                        </span>
                        
                        <span className={clsx(
                          "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black border tracking-normal shadow-sm",
                          getRoleBadgeClass(msg.role)
                        )}>
                          {getRoleLabel(msg.role)}
                        </span>

                        {isMe && (
                          <span className="badge badge-primary badge-xs py-1.5 px-2 font-black rounded-md">
                            You
                          </span>
                        )}

                        <div className="ml-auto flex items-center gap-2">
                          <span className="text-[10px] opacity-40 font-bold flex items-center gap-1">
                            <Clock size={10} />
                            {StringUtils.formatTimeAgo(new Date(msg.created_at).getTime())}
                          </span>
                          {canDelete && (
                            <button
                              onClick={() => handleDelete(msg.id)}
                              className="text-error/60 hover:text-error transition-colors p-1 hover:bg-error/10 rounded-md"
                              title="Delete message"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>

                      <p className="text-sm leading-relaxed whitespace-pre-wrap font-medium break-words pt-1 opacity-90 text-base-content">
                        {msg.message}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16 opacity-40 border border-dashed border-base-content/10 rounded-3xl space-y-2">
              <MessageSquare size={36} className="mx-auto opacity-20" />
              <p className="text-sm font-semibold">The board is currently empty.</p>
              <p className="text-xs">Be the first to leave a message!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Board;
