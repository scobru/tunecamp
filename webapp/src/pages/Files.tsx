import { confirm } from '@/utils/confirm';
import { useState, useEffect } from 'react';
import API from '../services/api';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Folder, File, ArrowLeft, Music, Image as ImageIcon, Trash2, MoreHorizontal, Edit2, Move } from 'lucide-react';
import { StringUtils } from '../utils/stringUtils';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useAuthStore } from '../stores/useAuthStore';
import { notify } from '../utils/notify';
import type { Track } from '../types';

const Files = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const currentPath = searchParams.get('path') || '/';
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const { playTrack } = usePlayerStore();
    const { isAdminAuthenticated, adminUser, isAdminLoading } = useAuthStore();
    const routerNavigate = useNavigate();

    useEffect(() => {
        if (!isAdminLoading && (!isAdminAuthenticated || !adminUser?.isAdmin)) {
             routerNavigate('/');
        }
    }, [isAdminAuthenticated, adminUser, isAdminLoading]);

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

    const handleRename = async (e: React.MouseEvent, item: any) => {
        e.stopPropagation();
        const newName = prompt("Enter new name:", item.name);
        if (!newName || newName === item.name) return;

        const parts = item.path.split("/");
        parts.pop();
        parts.push(newName);
        const newPath = parts.join("/");

        try {
            await API.renameBrowserPath(item.path, newPath);
            notify.success(`Renamed successfully to ${newName}`);
            loadData(currentPath);
        } catch (err: any) {
            notify.error(err, "Failed to rename");
        }
    };

    const handleMove = async (e: React.MouseEvent, item: any) => {
        e.stopPropagation();
        const targetDir = prompt("Enter target directory path (relative to root, or leave empty for Root):", item.path.split("/").slice(0, -1).join("/") || "/");
        if (targetDir === null) return; // User cancelled

        const cleanTarget = targetDir.trim().replace(/^\/+|\/+$/g, "");
        const newPath = cleanTarget ? `${cleanTarget}/${item.name}` : item.name;

        if (newPath === item.path) return;

        try {
            await API.renameBrowserPath(item.path, newPath);
            notify.success(`Moved successfully to ${newPath}`);
            loadData(currentPath);
        } catch (err: any) {
            notify.error(err, "Failed to move");
        }
    };

    const handleDelete = async (e: React.MouseEvent, item: any) => {
        e.stopPropagation();
        if (!await confirm(`Are you sure you want to delete ${item.name}?`)) return;
        
        try {
            await API.deleteBrowserPath(item.path);
            notify.success(`Deleted ${item.name}`);
            loadData(currentPath);
        } catch (err: any) {
            notify.error(err, "Failed to delete");
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
                <button className="btn btn-circle btn-ghost tooltip tooltip-right" onClick={goUp} disabled={currentPath === '/' || currentPath === ''} data-tip="Go up">
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

             <div className="bg-base-200 rounded-lg overflow-hidden border border-base-content/5">
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
                                <tr key={i} className="hover:bg-base-content/5 cursor-pointer group" onClick={() => handleFileClick(item)}>
                                    <td>{getIcon(item.type, item.name)}</td>
                                    <td className="font-medium">{item.name}</td>
                                    <td className="text-right font-mono opacity-60 text-xs text-nowrap">
                                        {item.type === 'file' || item.type === 'image' ? (item.size / 1024 / 1024).toFixed(2) + ' MB' : '-'}
                                    </td>
                                    <td className="text-right font-mono opacity-60 text-xs text-nowrap">
                                        {item.mtime ? new Date(item.mtime).toLocaleDateString() : '-'}
                                    </td>
                                    <td>
                                        <details className="dropdown dropdown-end opacity-70 hover:opacity-100 focus-within:opacity-100 transition-opacity z-10" onClick={e => e.stopPropagation()}>
                                            <summary className="btn btn-ghost btn-xs btn-circle list-none flex items-center justify-center" style={{ listStyle: 'none' }}>
                                                <MoreHorizontal size={16}/>
                                            </summary>
                                            <ul className="dropdown-content z-[50] menu p-2 shadow bg-base-300 rounded-box w-52 border border-base-content/10">
                                                <li>
                                                    <button type="button" onClick={(e) => { e.stopPropagation(); handleRename(e, item); }} className="text-left">
                                                        <Edit2 size={16}/> Rename
                                                    </button>
                                                </li>
                                                <li>
                                                    <button type="button" onClick={(e) => { e.stopPropagation(); handleMove(e, item); }} className="text-left">
                                                        <Move size={16}/> Move
                                                    </button>
                                                </li>
                                                <li>
                                                    <button type="button" onClick={(e) => { e.stopPropagation(); handleDelete(e, item); }} className="text-error text-left">
                                                        <Trash2 size={16}/> Delete
                                                    </button>
                                                </li>
                                            </ul>
                                        </details>
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

