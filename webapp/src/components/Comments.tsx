import { useState, useEffect } from 'react';
import API from '../services/api';
import { useAuthStore } from '../stores/useAuthStore';
import { MessageSquare, Trash2, Send } from 'lucide-react';
import { GleamUtils } from '../utils/gleam';

interface Comment {
    id: string;
    text: string;
    username: string;
    pubKey?: string;
    timestamp: number;
    createdAt?: string; // Legacy API might differ
}

interface CommentsProps {
    trackId?: string;
    albumId?: string; // Legacy seemed to focus on tracks, but maybe album comments too?
}

export const Comments = ({ trackId }: CommentsProps) => {
    const { user, isAuthenticated } = useAuthStore();
    const [comments, setComments] = useState<Comment[]>([]);
    const [loading, setLoading] = useState(false);
    const [newComment, setNewComment] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (trackId) {
            loadComments();
        }
    }, [trackId]);

    const loadComments = async () => {
        if (!trackId) return;
        setLoading(true);
        try {
            // Reusing legacy endpoint structure if possible, or adapting
            // The legacy api.js had `getComments(trackId)` fetching `/api/comments/track/${trackId}`
            // We need to ensure we have this method in our new API service or add it.
            // Looking at API service previously, it does NOT have comments methods yet.
            // I'll need to update API service first or cast to any here for now.
            
            // Using a direct fetch here if API is missing, but better to update API.
            // Assuming I will add it to API service shortly.
            const data = await (API as any).getComments(trackId);
            setComments(data || []);
        } catch (e) {
            console.warn('Failed to load comments', e);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim() || !trackId) return;
        setSubmitting(true);
        try {
            await (API as any).postComment(trackId, newComment);
            setNewComment('');
            loadComments(); // Reload to see new comment
        } catch (e) {
            console.error(e);
            alert('Failed to post comment');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (commentId: string) => {
        if (!confirm('Delete this comment?')) return;
        try {
            await (API as any).deleteComment(commentId);
            loadComments();
        } catch (e) {
            console.error(e);
        }
    };

    if (!trackId) return null;

    return (
        <div className="mt-8">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <MessageSquare size={20} /> Comments 
                <span className="badge badge-sm">{comments.length}</span>
            </h3>

            {/* Comment Form */}
            {isAuthenticated ? (
                <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
                    <input 
                        type="text" 
                        className="input input-bordered flex-1" 
                        placeholder="Write a comment..." 
                        value={newComment}
                        onChange={e => setNewComment(e.target.value)}
                    />
                    <button type="submit" className="btn btn-primary" disabled={submitting || !newComment.trim()}>
                        <Send size={16} />
                    </button>
                </form>
            ) : (
                <div className="text-sm opacity-50 mb-6 italic">Log In to post comments.</div>
            )}

            {/* List */}
            <div className="space-y-4">
                {loading ? (
                    <div className="opacity-50 text-sm">Loading comments...</div>
                ) : comments.length === 0 ? (
                    <div className="opacity-30 text-sm">No comments yet.</div>
                ) : (
                    comments.map((c) => (
                        <div key={c.id} className="bg-base-200/50 p-3 rounded-lg border border-white/5 flex gap-3 group">
                            <div className="avatar placeholder">
                                <div className="bg-neutral text-neutral-content rounded-full w-8 h-8">
                                    <span>{c.username?.charAt(0).toUpperCase()}</span>
                                </div>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start">
                                    <span className="font-bold text-sm">{c.username}</span>
                                    <span className="text-xs opacity-40">{GleamUtils.formatTimeAgo(0, c.timestamp || Date.now())}</span>
                                </div>
                                <p className="text-sm opacity-80 break-words">{c.text}</p>
                            </div>
                            {(user?.isAdmin || user?.username === c.username) && (
                                <button 
                                    className="btn btn-ghost btn-xs btn-circle text-error opacity-0 group-hover:opacity-100 transition-opacity self-center"
                                    onClick={() => handleDelete(c.id)}
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
