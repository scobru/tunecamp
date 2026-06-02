import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import API from '../services/api';
import { User, Clock, ArrowLeft, BookOpen, Share2 } from 'lucide-react';
import type { Post } from '../types';

export const PostPage = () => {
    const { slug } = useParams<{ slug: string }>();
    const [post, setPost] = useState<Post | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [scrollPercent, setScrollPercent] = useState(0);
    const [copiedShare, setCopiedShare] = useState(false);

    useEffect(() => {
        if (slug) loadPost(slug);
    }, [slug]);

    useEffect(() => {
        const handleScroll = () => {
            const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
            if (totalHeight > 0) {
                const progress = (window.scrollY / totalHeight) * 100;
                setScrollPercent(progress);
            }
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

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

    const handleShare = () => {
        navigator.clipboard.writeText(window.location.href);
        setCopiedShare(true);
        setTimeout(() => setCopiedShare(false), 2000);
    };

    if (loading) return <div className="text-center opacity-50 py-12">Loading article...</div>;
    if (error || !post) return (
        <div className="text-center py-12">
            <h2 className="text-2xl font-bold mb-4">{error || 'Article not found'}</h2>
            <Link to="/" className="btn btn-primary">Go Home</Link>
        </div>
    );

    // Calculate reading time (roughly 200 words per minute)
    const textOnly = post.content.replace(/<[^>]*>?/gm, '');
    const wordCount = textOnly.trim().split(/\s+/).length;
    const readingTime = Math.max(1, Math.ceil(wordCount / 200));

    const isArticle = !!post.title;

    return (
        <div className="relative min-h-screen">
            {/* Top Reading Progress Bar */}
            <div className="fixed top-0 left-0 w-full h-[3px] bg-base-content/5 z-[9999]">
                <div 
                    className="h-full bg-gradient-to-r from-primary via-accent to-secondary transition-all duration-75"
                    style={{ width: `${scrollPercent}%` }}
                />
            </div>

            <div className="max-w-3xl mx-auto p-6 md:py-12 animate-fade-in space-y-8">
                
                {/* Top Control Bar with Glassmorphism Back and Share */}
                <div className="flex items-center justify-between not-prose mb-4">
                    <button 
                        onClick={() => window.history.back()} 
                        className="btn btn-ghost btn-sm gap-2 pl-0 hover:bg-transparent text-base-content/75 hover:text-primary transition-all duration-300"
                    >
                        <ArrowLeft size={16}/> Back
                    </button>

                    <button 
                        onClick={handleShare}
                        className="btn btn-sm btn-ghost btn-circle text-base-content/60 hover:text-primary hover:bg-base-200"
                        title="Copy article link"
                    >
                        {copiedShare ? <span className="text-[10px] text-success font-bold font-mono">Copied!</span> : <Share2 size={16} />}
                    </button>
                </div>

                <article className="prose prose-invert lg:prose-xl max-w-none">
                    
                    {/* Header: Author & Meta Info block */}
                    <div className="flex items-center gap-4 mb-8 pb-6 border-b border-base-content/10 not-prose">
                        <div className="avatar">
                            <div className="w-14 h-14 rounded-full border-2 border-primary/20 shadow-md overflow-hidden bg-base-300">
                                 {post.artistId ? (
                                    <img 
                                        src={API.getArtistCoverUrl(post.artistId)} 
                                        alt={post.artistName} 
                                        className="object-cover w-full h-full"
                                    />
                                 ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-neutral text-neutral-content">
                                        <User size={24}/>
                                    </div>
                                 )}
                            </div>
                        </div>
                        <div className="space-y-0.5">
                            <div className="font-bold text-lg text-base-content hover:text-primary transition-colors cursor-pointer">{post.artistName || 'Unknown Artist'}</div>
                            <div className="text-xs opacity-60 flex items-center gap-3 font-semibold tracking-wider uppercase">
                                <span className="flex items-center gap-1"><Clock size={12}/> {new Date(post.createdAt).toLocaleDateString()}</span>
                                <span>•</span>
                                <span className="flex items-center gap-1"><BookOpen size={12}/> {readingTime} min read</span>
                            </div>
                        </div>
                    </div>

                    {/* Article Title */}
                    {isArticle ? (
                        <h1 className="text-4xl sm:text-5xl font-serif font-black tracking-tight text-prominent leading-tight mb-4">
                            {post.title}
                        </h1>
                    ) : null}

                    {/* Styled Premium Quotation Summary Block */}
                    {post.summary ? (
                        <div className="text-xl italic font-serif opacity-90 border-l-4 border-primary bg-primary/5 p-6 rounded-r-2xl mb-8 leading-relaxed shadow-inner">
                            {post.summary}
                        </div>
                    ) : null}

                    {/* Premium Serif Article Body Content */}
                    <div 
                        className={`leading-relaxed opacity-95 font-serif text-lg sm:text-xl prose prose-invert max-w-none space-y-6 select-text pt-2 ${
                            isArticle ? 'prose-headings:font-serif prose-headings:font-black prose-p:font-serif first-letter:text-6xl first-letter:font-black first-letter:text-primary first-letter:float-left first-letter:mr-3 first-letter:mt-1.5' : ''
                        }`}
                        dangerouslySetInnerHTML={{ __html: post.content }}
                    />
                </article>
            </div>
        </div>
    );
};

export default PostPage;
