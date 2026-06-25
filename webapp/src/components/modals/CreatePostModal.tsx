import { useState, useRef, useEffect, useMemo } from 'react';
import API from '../../services/api';
import { PenTool, Globe, Eye, Lock, Send, X, Image as ImageIcon } from 'lucide-react';
import type { Artist } from '../../types';
import { useAuthStore } from '../../stores/useAuthStore';
import { renderMarkdown } from '../../utils/markdown';

export const CreatePostModal = ({ onPostCreated }: { onPostCreated?: () => void }) => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const { user } = useAuthStore();
    const [content, setContent] = useState('');
    const [title, setTitle] = useState('');
    const [summary, setSummary] = useState('');
    const [artistId, setArtistId] = useState('');
    const [artists, setArtists] = useState<Artist[]>([]);
    const [visibility, setVisibility] = useState<'public' | 'unlisted' | 'private'>('public');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [tab, setTab] = useState<'write' | 'preview'>('write');
    const [editingPostId, setEditingPostId] = useState<number | null>(null);
    const [linkPreview, setLinkPreview] = useState<{url: string; title: string | null; description: string | null; image: string | null; siteName: string | null} | null>(null);
    const [linkPreviewLoading, setLinkPreviewLoading] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [imageUploading, setImageUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImageUploading(true);
        setError('');

        try {
            const res = await API.uploadPostMedia(file);
            if (res && res.url) {
                insertAtCursor(`![Image Description](${res.url})`);
            } else {
                setError('Failed to upload image');
            }
        } catch (err: any) {
            setError(err.message || 'Failed to upload image');
        } finally {
            setImageUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const insertAtCursor = (textToInsert: string) => {
        const textarea = textareaRef.current;
        if (!textarea) {
            setContent(prev => prev + textToInsert);
            return;
        }

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const before = text.substring(0, start);
        const after = text.substring(end, text.length);

        setContent(before + textToInsert + after);

        // Reset cursor position after insert
        setTimeout(() => {
            textarea.focus();
            textarea.selectionStart = textarea.selectionEnd = start + textToInsert.length;
        }, 0);
    };

    useEffect(() => {
        const handleOpen = (e: Event) => {
             const customEvent = e as CustomEvent;
             const postToEdit = customEvent.detail;

             loadArtists();
             
             if (postToEdit) {
                 setEditingPostId(postToEdit.id);
                 setContent(postToEdit.content || '');
                 setTitle(postToEdit.title || '');
                 setSummary(postToEdit.summary || '');
                 setVisibility(postToEdit.visibility || 'public');
                 setArtistId(String(postToEdit.artistId || postToEdit.artist_id || ''));
             } else {
                 setEditingPostId(null);
                 setContent('');
                 setTitle('');
                 setSummary('');
                 setVisibility('public');
             }
             
             setTab('write');
             setError('');
             dialogRef.current?.showModal();
        };

        document.addEventListener('open-create-post-modal', handleOpen);
        return () => document.removeEventListener('open-create-post-modal', handleOpen);
    }, [user]);

    // Detect URLs and fetch link preview
    useEffect(() => {
        const urlMatch = content.match(/https?:\/\/[^\s<>"']+/);
        const firstUrl = urlMatch?.[0];
        if (!firstUrl) {
            setLinkPreview(null);
            return;
        }
        if (linkPreview?.url === firstUrl) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            setLinkPreviewLoading(true);
            try {
                const preview = await API.getLinkPreview(firstUrl);
                setLinkPreview(preview);
            } catch {
                setLinkPreview(null);
            } finally {
                setLinkPreviewLoading(false);
            }
        }, 800);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [content]);

    const isRootAdminNoArtist = !!(user?.isRootAdmin && (!user.artistId || user.artistId === '0' || user.artistId === 'null' || user.artistId === 'undefined'));

    const loadArtists = async () => {
        try {
            const data = await API.getArtists();
            setArtists(data);

            if (isRootAdminNoArtist) {
                // Root admin without an artist posts as the SITE instance actor
                setArtistId('-1');
            } else if (user?.artistId && user.artistId !== '0' && user.artistId !== 'null' && user.artistId !== 'undefined') {
                setArtistId(String(user.artistId));
            } else if (data.length > 0) {
                setArtistId(String(data[0].id));
            }
        } catch (e) { console.error(e); }
    };

    const selectedArtist = useMemo(() => 
        artists.find(a => String(a.id) === String(artistId)), 
    [artists, artistId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!artistId && !editingPostId) {
            setError('Please select an artist');
            return;
        }
        if (content.length > 5000) {
            setError('Content exceeds 5000 characters limit');
            return;
        }
        setLoading(true);
        setError('');

        try {
            if (editingPostId) {
                await API.updatePost(editingPostId, content, visibility, title || undefined, summary || undefined);
            } else {
                await API.createPost(Number(artistId), content, visibility, title || undefined, summary || undefined);
            }
            if (onPostCreated) onPostCreated();
            dialogRef.current?.close();
        } catch (e: any) {
             setError(e.message || (editingPostId ? 'Failed to update post' : 'Failed to create post'));
        } finally {
            setLoading(false);
        }
    };

    const isRestrictedArtist = isRootAdminNoArtist || !!(user?.artistId && user.artistId !== '0' && user.artistId !== 'null' && user.artistId !== 'undefined');

    // Circular progress metrics for character counter
    const charPercentage = Math.min((content.length / 5000) * 100, 100);
    const radius = 14;
    const stroke = 3;
    const normalizedRadius = radius - stroke * 2;
    const circumference = normalizedRadius * 2 * Math.PI;
    const strokeDashoffset = circumference - (charPercentage / 100) * circumference;

    return (
        <dialog id="create-post-modal" className="modal" ref={dialogRef}>
            <div className="modal-box bg-base-100 border border-base-content/5 w-11/12 max-w-2xl rounded-2xl shadow-level-1 p-6">
                <form method="dialog">
                    <button className="btn btn-sm btn-circle btn-ghost absolute right-4 top-4 rounded-full">✕</button>
                </form>
                
                <h3 className="font-bold text-xl mb-6 flex items-center gap-2 tracking-tight">
                    <PenTool size={22} className="text-primary"/> {editingPostId ? 'Edit Activity / Article' : 'Compose New Activity'}
                </h3>

                <form onSubmit={handleSubmit} className="space-y-5">
                      {isRestrictedArtist ? (
                        <div className="bg-base-200/50 p-4 rounded-xl border border-base-content/5 flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className="text-xs font-bold opacity-40 tracking-normal">Posting Identity</span>
                                <span className="font-bold text-base-content mt-0.5">
                                    {isRootAdminNoArtist ? 'Site' : (selectedArtist?.name || 'Loading profile...')}
                                </span>
                            </div>
                            <span className="badge badge-primary badge-outline badge-sm rounded-full font-bold px-3 py-2">
                                {isRootAdminNoArtist ? 'SITE' : 'Sovereign Account'}
                            </span>
                        </div>
                      ) : (
                        <div className="form-control w-full">
                            <label className="label">
                                <span className="label-text font-bold text-xs opacity-60">Post as Artist Identity</span>
                            </label>
                            <select 
                                className="select select-bordered w-full rounded-xl bg-base-200 border-base-content/10 focus:outline-none focus:border-primary"
                                value={artistId}
                                onChange={e => setArtistId(e.target.value)}
                                required
                            >
                                {artists.map(a => (
                                    <option key={a.id} value={a.id}>{a.name}</option>
                                ))}
                            </select>
                        </div>
                      )}

                    {/* Optional Title & Summary for federated articles */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text font-bold text-xs opacity-60">Article Title (Optional)</span>
                            </label>
                            <input 
                                type="text"
                                className="input input-bordered w-full rounded-xl bg-base-200/30 border-base-content/10 focus:outline-none focus:border-primary px-4 py-2 text-sm"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder="E.g. TuneCamp Platform Updates"
                            />
                        </div>
                        <div className="form-control">
                            <label className="label">
                                <span className="label-text font-bold text-xs opacity-60">Article Summary (Optional)</span>
                            </label>
                            <input 
                                type="text"
                                className="input input-bordered w-full rounded-xl bg-base-200/30 border-base-content/10 focus:outline-none focus:border-primary px-4 py-2 text-sm"
                                value={summary}
                                onChange={e => setSummary(e.target.value)}
                                placeholder="E.g. A quick overview of our new features..."
                            />
                        </div>
                    </div>

                    {/* Content text editor */}
                    <div className="form-control">
                        <div className="flex justify-between items-center label">
                            <label className="label-text font-bold text-xs opacity-60">Content Body</label>
                            
                            <div className="flex bg-base-300/60 p-0.5 rounded-lg text-xs shrink-0">
                                <button
                                    type="button"
                                    className={`px-3 py-1 rounded-md font-bold transition-all ${tab === 'write' ? 'bg-primary text-primary-content shadow-sm' : 'opacity-60 hover:opacity-100'}`}
                                    onClick={() => setTab('write')}
                                >
                                    Write
                                </button>
                                <button
                                    type="button"
                                    className={`px-3 py-1 rounded-md font-bold transition-all ${tab === 'preview' ? 'bg-primary text-primary-content shadow-sm' : 'opacity-60 hover:opacity-100'}`}
                                    onClick={() => setTab('preview')}
                                >
                                    Preview
                                </button>
                            </div>
                        </div>
                        <div className="relative">
                            {tab === 'write' ? (
                                <textarea 
                                    ref={textareaRef}
                                    className="textarea textarea-bordered w-full min-h-[250px] text-base rounded-xl bg-base-200/30 border-base-content/10 focus:outline-none focus:border-primary p-4 scrollbar-thin resize-y" 
                                    value={content}
                                    onChange={e => setContent(e.target.value)}
                                    placeholder="What's new in the community? Share releases, thoughts, updates... (Markdown images supported)"
                                    maxLength={5500}
                                    required
                                />
                            ) : (
                                <div 
                                    className="prose prose-sm prose-invert max-w-none p-4 rounded-xl bg-base-200/30 border border-base-content/10 min-h-[250px] max-h-[400px] overflow-y-auto scrollbar-thin select-text"
                                    dangerouslySetInnerHTML={{ __html: renderMarkdown(content) || '<p class="opacity-40 italic">Nothing to preview yet...</p>' }}
                                />
                            )}
                        </div>
                    </div>

                    {/* Link preview card */}
                    {(linkPreviewLoading || linkPreview) && (
                        <div className="rounded-xl border border-base-content/10 overflow-hidden bg-base-200/40">
                            {linkPreviewLoading ? (
                                <div className="p-3 flex items-center gap-2 text-xs opacity-50">
                                    <span className="loading loading-spinner loading-xs" />
                                    Fetching link preview…
                                </div>
                            ) : linkPreview && (
                                <div className="flex gap-3 p-3">
                                    {linkPreview.image && (
                                        <img
                                            src={linkPreview.image}
                                            alt=""
                                            className="w-20 h-20 object-cover rounded-lg flex-shrink-0"
                                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                        />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        {linkPreview.siteName && <div className="text-xs opacity-50 font-bold uppercase tracking-wider truncate">{linkPreview.siteName}</div>}
                                        {linkPreview.title && <div className="text-sm font-bold truncate mt-0.5">{linkPreview.title}</div>}
                                        {linkPreview.description && <div className="text-xs opacity-70 line-clamp-2 mt-0.5">{linkPreview.description}</div>}
                                        <div className="text-xs opacity-40 truncate mt-1">{linkPreview.url}</div>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn btn-xs btn-ghost btn-circle flex-shrink-0 self-start"
                                        onClick={() => setLinkPreview(null)}
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Bottom controls panel inside modal */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-2 border-t border-base-content/5">
                        
                        {/* Visibility settings dropdown & Upload media */}
                        <div className="flex items-center gap-2">
                            <div className="dropdown dropdown-top">
                                <div 
                                    tabIndex={0} 
                                    role="button" 
                                    className="btn btn-sm btn-ghost bg-base-200 border-none rounded-full gap-2 text-xs px-4"
                                >
                                    {visibility === 'public' && <Globe size={14} className="text-primary" />}
                                    {visibility === 'unlisted' && <Eye size={14} className="text-accent" />}
                                    {visibility === 'private' && <Lock size={14} className="text-warning" />}
                                    <span className="capitalize font-bold">{visibility === 'private' ? 'Followers only' : visibility}</span>
                                </div>
                                <ul tabIndex={0} className="dropdown-content menu bg-base-200 border border-base-content/5 rounded-box z-[10] w-48 p-1.5 shadow-level-1 mb-1">
                                    <li>
                                        <button 
                                            type="button" 
                                            className={`gap-2 rounded-lg text-xs py-2 ${visibility === 'public' ? 'active bg-primary text-primary-content' : ''}`}
                                            onClick={() => setVisibility('public')}
                                        >
                                            <Globe size={14} /> <span>Public (🌐)</span>
                                        </button>
                                    </li>
                                    <li>
                                        <button 
                                            type="button" 
                                            className={`gap-2 rounded-lg text-xs py-2 ${visibility === 'unlisted' ? 'active bg-primary text-primary-content' : ''}`}
                                            onClick={() => setVisibility('unlisted')}
                                        >
                                            <Eye size={14} /> <span>Unlisted (👁️)</span>
                                        </button>
                                    </li>
                                    <li>
                                        <button 
                                            type="button" 
                                            className={`gap-2 rounded-lg text-xs py-2 ${visibility === 'private' ? 'active bg-primary text-primary-content' : ''}`}
                                            onClick={() => setVisibility('private')}
                                        >
                                            <Lock size={14} /> <span>Followers-only (🔒)</span>
                                        </button>
                                    </li>
                                </ul>
                            </div>

                            {/* Upload Image Button */}
                            <button
                                type="button"
                                className="btn btn-sm btn-ghost bg-base-200 border-none rounded-full gap-2 text-xs px-4"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={imageUploading || loading}
                            >
                                {imageUploading ? (
                                    <span className="loading loading-spinner loading-xs" />
                                ) : (
                                    <ImageIcon size={14} className="text-primary" />
                                )}
                                <span>Add Image</span>
                            </button>
                            <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                ref={fileInputRef}
                                onChange={handleImageUpload}
                            />
                        </div>

                        {/* Character count & Submit buttons */}
                        <div className="flex items-center justify-end gap-4">
                            {/* SVG Character Limit Counter */}
                            <div className="relative flex items-center justify-center">
                                <svg height={radius * 2} width={radius * 2} className="transform -rotate-90">
                                    <circle
                                        stroke="rgba(255, 255, 255, 0.05)"
                                        fill="transparent"
                                        strokeWidth={stroke}
                                        r={normalizedRadius}
                                        cx={radius}
                                        cy={radius}
                                    />
                                    <circle
                                        stroke={content.length > 5000 ? 'var(--color-error)' : content.length > 4200 ? 'var(--color-warning)' : 'var(--color-primary)'}
                                        fill="transparent"
                                        strokeWidth={stroke}
                                        strokeDasharray={circumference + ' ' + circumference}
                                        style={{ strokeDashoffset, transition: 'stroke-dashoffset 0.1s ease-out' }}
                                        r={normalizedRadius}
                                        cx={radius}
                                        cy={radius}
                                    />
                                </svg>

                                {content.length >= 4500 && (
                                    <span className={`absolute text-[8px] font-bold ${content.length > 5000 ? 'text-error' : 'text-base-content'}`}>
                                        {5000 - content.length}
                                    </span>
                                )}
                            </div>

                            <div className="flex gap-2">
                                <button type="button" className="btn btn-sm btn-ghost rounded-full px-4" onClick={() => dialogRef.current?.close()}>Cancel</button>
                                <button
                                    type="submit"
                                    className="btn btn-sm btn-primary rounded-full px-5 gap-1.5 shadow-md"
                                    disabled={loading || content.trim().length === 0 || content.length > 5000}
                                >
                                    {loading ? (
                                        <span className="loading loading-spinner loading-xs"/>
                                    ) : (
                                        <>
                                            <Send size={12}/>
                                            <span>{editingPostId ? 'Save Changes' : 'Publish'}</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>

                    {error && <div className="text-error text-xs font-bold bg-error/5 p-3 rounded-xl border border-error/10">{error}</div>}
                </form>
            </div>
            <form method="dialog" className="modal-backdrop">
                <button>close</button>
            </form>
        </dialog>
    );
};


