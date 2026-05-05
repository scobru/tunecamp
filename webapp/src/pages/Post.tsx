import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import API from '../services/api';
import { User, Clock, ArrowLeft } from 'lucide-react';
import type { Post } from '../types';

export const PostPage = () => {
    const { slug } = useParams<{ slug: string }>();
    const [post, setPost] = useState<Post | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (slug) loadPost(slug);
    }, [slug]);

    const loadPost = async (slug: string) => {
        setLoading(true);
        try {
            const data = await API.getPostBySlug(slug);
            setPost(data);
        } catch (e) {
            console.error(e);
            setError('Post not found');
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="text-center opacity-50 py-12">Loading post...</div>;
    if (error || !post) return (
        <div className="text-center py-12">
            <h2 className="text-2xl font-bold mb-4">{error || 'Post not found'}</h2>
            <Link to="/" className="btn btn-primary">Go Home</Link>
        </div>
    );

    return (
        <div className="max-w-3xl mx-auto p-6 animate-fade-in">
            <Link to="/" className="btn btn-ghost btn-sm gap-2 mb-8 pl-0">
                <ArrowLeft size={16}/> Back
            </Link>

            <article className="prose prose-invert lg:prose-xl">
                <div className="flex items-center gap-4 mb-8 not-prose">
                    <div className="avatar placeholder">
                        <div className="bg-neutral text-neutral-content rounded-full w-12 h-12">
                             {post.artistId ? (
                                <img src={API.getArtistCoverUrl(post.artistId)} alt={post.artistName} />
                             ) : (
                                <User size={24}/>
                             )}
                        </div>
                    </div>
                    <div>
                        <div className="font-bold text-lg">{post.artistName || 'Unknown Artist'}</div>
                        <div className="text-sm opacity-50 flex items-center gap-2">
                            <Clock size={12}/> {new Date(post.createdAt).toLocaleDateString()}
                        </div>
                    </div>
                </div>

                <div className="whitespace-pre-wrap leading-relaxed opacity-90 font-serif text-lg">
                    {post.content}
                </div>
            </article>
        </div>
    );
};

