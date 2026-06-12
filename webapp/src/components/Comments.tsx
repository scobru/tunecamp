import { useState, useEffect } from "react";
import API from "../services/api";
import { useAuthStore } from "../stores/useAuthStore";
import { MessageSquare, Trash2, Send } from "lucide-react";
import { StringUtils } from "../utils/stringUtils";
import { notify } from "../utils/notify";

interface Comment {
  id: number;
  track_id: number;
  username: string;
  text: string;
  created_at: string;
}

interface CommentsProps {
  trackId?: string;
}

export const Comments = ({ trackId }: CommentsProps) => {
  const { user, isAuthenticated } = useAuthStore();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (trackId) loadComments();
  }, [trackId]);

  const loadComments = async () => {
    if (!trackId) return;
    setLoading(true);
    try {
      const data = await API.getComments(trackId);
      setComments(data || []);
    } catch (e) {
      console.warn("Failed to load comments", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !trackId) return;
    if (!isAuthenticated) {
      notify.warning("Please log in to comment.");
      return;
    }
    setSubmitting(true);
    try {
      await API.postComment(trackId, { text: newComment.trim() });
      setNewComment("");
      loadComments();
    } catch (e) {
      console.error(e);
      notify.error(e, "Failed to post comment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: number) => {
    if (!confirm("Delete this comment?")) return;
    try {
      await API.deleteComment(commentId);
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch (e) {
      console.error(e);
      notify.error(e, "Failed to delete comment");
    }
  };

  const canDelete = (c: Comment) => !!(user?.isAdmin || user?.username === c.username);

  if (!trackId) return null;

  return (
    <div className="mt-8">
      <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
        <MessageSquare size={20} /> Comments
        <span className="badge badge-sm">{comments.length}</span>
      </h3>

      {isAuthenticated ? (
        <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
          <input
            type="text"
            className="input input-bordered flex-1"
            placeholder="Write a comment..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting || !newComment.trim()}
          >
            <Send size={16} />
          </button>
        </form>
      ) : (
        <div className="text-sm opacity-50 mb-6 italic">Log in to post comments.</div>
      )}

      <div className="space-y-4">
        {loading ? (
          <div className="opacity-50 text-sm">Loading comments...</div>
        ) : comments.length === 0 ? (
          <div className="opacity-30 text-sm">No comments yet.</div>
        ) : (
          comments.map((c) => (
            <div
              key={c.id}
              className="bg-base-200/50 p-3 rounded-lg border border-base-content/5 flex gap-3 group"
            >
              <div className="avatar placeholder">
                <div className="bg-neutral text-neutral-content rounded-full w-8 h-8">
                  <span>{c.username?.charAt(0).toUpperCase()}</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <span className="font-bold text-sm">{c.username}</span>
                  <span className="text-xs opacity-40">
                    {StringUtils.formatTimeAgo(0, new Date(c.created_at).getTime())}
                  </span>
                </div>
                <p className="text-sm opacity-80 break-words">{c.text}</p>
              </div>
              {canDelete(c) && (
                <button
                  className="btn btn-ghost btn-xs btn-circle text-error opacity-0 group-hover:opacity-100 transition-opacity self-center tooltip tooltip-left"
                  onClick={() => handleDelete(c.id)}
                  data-tip="Delete Comment"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
