import { useState, useEffect } from 'react';
import API from '../services/api';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Folder, File, ArrowLeft, Music, Image as ImageIcon, Trash2, MoreHorizontal } from 'lucide-react';
import { StringUtils } from '../utils/stringUtils';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useAuthStore } from '../stores/useAuthStore';
import type { Track } from '../types';

export const Files = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const currentPath = searchParams.get('path') || '/';
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const { playTrack } = usePlayerStore();
    const { isAdminAuthenticated, adminUser } = useAuthStore();
    const routerNavigate = useNavigate();

    useEffect(() => {
        if (!isAdminAuthenticated || !adminUser?.isAdmin) {
             routerNavigate('/');
        }
    }, [isAdminAuthenticated, adminUser]);

    useEffect(() => {
        loadData(currentPath);
    }, [currentPath]);

    const loadData = async (path: string) => {
        setLoading(true);
        try {
            const data = await API.getBrowser(path);
            if (data && data.entries) {
                setItems(data.entries);
            } else if (Array.isArray(data)) {
                setItems(data);
            } else {
                setItems([]);
            }
        } catch (e) {
            console.error(e);
            setItems([]);
        } finally {
            setLoading(false);
        }
    };

    const updatePath = (path: string) => {
        setSearchParams({ path });
    };

    const goUp = () => {
        const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
        updatePath(parent);
    };

    const handleFileClick = (item: any) => {
        if (item.type === 'directory') {
            updatePath(item.path);
        } else {
            // If audio, play
            const ext = StringUtils.getFileExtension(item.name);
            if (['mp3', 'flac', 'wav', 'm4a', 'ogg'].includes(ext)) {
               // Construct a temporary track object
               const track: Track = {
                   id: item.path, // Use path as ID for stream
                   title: item.name,
                   artistId: 'unknown',
                   artistName: 'Unknown Artist',
                   albumId: 'unknown',
                   duration: 0,
                   path: item.path,
                   filename: item.name,
                   playCount: 0
               };
               playTrack(track); // Note: API.getStreamUrl needs to handle paths if ID is path, or we need a special stream endpoint for files
            }
        }
    };

    const handleDelete = async (e: React.MouseEvent, item: any) => {
        e.stopPropagation();
        if (!confirm(`Are you sure you want to delete ${item.name}?`)) return;
        
        try {
            await API.deleteBrowserPath(item.path);
            loadData(currentPath);
        } catch (err: any) {
            alert("Failed to delete: " + err.message);
        }
    };

    const getIcon = (type: string, name: string) => {
        if (type === 'directory') return <Folder className="text-yellow-400" size={24}/>;
        const ext = StringUtils.getFileExtension(name);
        if (['mp3', 'flac', 'wav', 'm4a', 'ogg'].includes(ext)) return <Music className="text-blue-400" size={24}/>;
        if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return <ImageIcon className="text-purple-400" size={24}/>;
        return <File className="opacity-50" size={24}/>;
    };

    return (
        <div className="space-y-6 animate-fade-in">
             <div className="flex items-center gap-4">
                <button className="btn btn-circle btn-ghost" onClick={goUp} disabled={currentPath === '/' || currentPath === ''}>
                    <ArrowLeft size={20}/>
                </button>
                <div className="text-xl font-mono opacity-70 breadcrumbs">
                    <ul>
                        <li><button onClick={() => updatePath('/')}>Root</button></li>
                        {currentPath.split('/').filter(Boolean).map((part, i, arr) => (
                             <li key={i}>
                                 <button onClick={() => updatePath('/' + arr.slice(0, i + 1).join('/'))}>{part}</button>
                             </li>
                        ))}
                    </ul>
                </div>
             </div>

             <div className="bg-base-200 rounded-lg overflow-hidden border border-white/5">
                {loading ? (
                    <div className="p-12 text-center opacity-50">Loading...</div>
                ) : (
                    <table className="table w-full">
                        <thead>
                            <tr>
                                <th className="w-12"></th>
                                <th>Name</th>
                                <th className="text-right">Size</th>
                                <th className="text-right">Modified</th>
                                <th className="w-12"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, i) => (
                                <tr key={i} className="hover:bg-white/5 cursor-pointer group" onClick={() => handleFileClick(item)}>
                                    <td>{getIcon(item.type, item.name)}</td>
                                    <td className="font-medium">{item.name}</td>
                                    <td className="text-right font-mono opacity-60 text-xs text-nowrap">
                                        {item.type === 'file' || item.type === 'image' ? (item.size / 1024 / 1024).toFixed(2) + ' MB' : '-'}
                                    </td>
                                    <td className="text-right font-mono opacity-60 text-xs text-nowrap">
                                        {item.mtime ? new Date(item.mtime).toLocaleDateString() : '-'}
                                    </td>
                                    <td>
                                        <div className="dropdown dropdown-end group-hover:opacity-100 opacity-0 transition-opacity">
                                            <label tabIndex={0} className="btn btn-ghost btn-xs btn-circle" onClick={e => e.stopPropagation()}>
                                                <MoreHorizontal size={16}/>
                                            </label>
                                            <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow bg-base-300 rounded-box w-52 border border-white/10">
                                                <li>
                                                    <a onClick={(e) => handleDelete(e, item)} className="text-error">
                                                        <Trash2 size={16}/> Delete
                                                    </a>
                                                </li>
                                            </ul>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {items.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="text-center py-8 opacity-50">Empty directory</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
             </div>
        </div>
    );
};

export default Files;
