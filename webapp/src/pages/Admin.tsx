import { useState, useEffect } from 'react';
import API from '../services/api';
import { useAuthStore } from '../stores/useAuthStore';
import { useNavigate } from 'react-router-dom';
import { BarChart2, Settings, Database, RefreshCw, Save, User } from 'lucide-react';
import { AdminUserModal } from '../components/modals/AdminUserModal';
import { AdminReleaseModal } from '../components/modals/AdminReleaseModal';
import { AdminArtistModal } from '../components/modals/AdminArtistModal';
import { UploadTracksModal } from '../components/modals/UploadTracksModal';
import { CreatePostModal } from '../components/modals/CreatePostModal';
import { IdentityPanel } from '../components/admin/IdentityPanel';
import { ActivityPubPanel } from '../components/admin/ActivityPubPanel';
import type { SiteSettings } from '../types';

export const Admin = () => {
    const { adminUser, isAdminAuthenticated } = useAuthStore();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'overview' | 'content' | 'tracks' | 'users' | 'artists' | 'settings' | 'system' | 'identity' | 'activitypub'>('overview');
    const [stats, setStats] = useState<any>(null);

    // const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isAdminAuthenticated || !adminUser?.isAdmin) {
             navigate('/');
             return;
        }
        loadStats();
    }, [isAdminAuthenticated, adminUser]);

    const loadStats = async () => {
        // setLoading(true);
        try {
            const data = await API.getAdminStats();
            setStats(data);
        } catch (e) {
            console.error(e);
        } finally {
            // setLoading(false);
        }
    };

    const handleSystemAction = async (action: 'scan' | 'consolidate') => {
        if (!confirm(`Are you sure you want to ${action}? This may take a while.`)) return;
        try {
            if (action === 'scan') await API.rescan();
            if (action === 'consolidate') await API.consolidate();
            alert(`${action} started in background.`);
        } catch (e) {
            console.error(e);
            alert('Failed to start action');
        }
    };

    if (!adminUser?.isAdmin) return null;

    return (
        <div className="space-y-8 animate-fade-in">
            <h1 className="text-3xl font-bold flex items-center gap-3">
                <Settings size={32} className="text-primary"/> Admin Dashboard
            </h1>

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="stat bg-base-200 rounded-box border border-white/5">
                        <div className="stat-title">Total Users</div>
                        <div className="stat-value text-primary">{stats.totalUsers}</div>
                    </div>
                    <div className="stat bg-base-200 rounded-box border border-white/5">
                        <div className="stat-title">Total Tracks</div>
                        <div className="stat-value text-secondary">{stats.totalTracks}</div>
                    </div>
                    <div className="stat bg-base-200 rounded-box border border-white/5">
                        <div className="stat-title">Storage Used</div>
                        <div className="stat-value text-accent">{(stats.storageUsed / 1024 / 1024 / 1024).toFixed(2)} GB</div>
                    </div>
                     <div className="stat bg-base-200 rounded-box border border-white/5">
                        <div className="stat-title">Network Sites</div>
                        <div className="stat-value">{stats.networkSites}</div>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div role="tablist" className="tabs tabs-lifted">
                <a role="tab" className={`tab ${activeTab === 'overview' ? 'tab-active' : ''}`} onClick={() => setActiveTab('overview')}>Overview</a>
                <a role="tab" className={`tab ${activeTab === 'content' ? 'tab-active' : ''}`} onClick={() => setActiveTab('content')}>Content</a>
                <a role="tab" className={`tab ${activeTab === 'tracks' ? 'tab-active' : ''}`} onClick={() => setActiveTab('tracks')}>Tracks</a>
                <a role="tab" className={`tab ${activeTab === 'users' ? 'tab-active' : ''}`} onClick={() => setActiveTab('users')}>Users</a>
                <a role="tab" className={`tab ${activeTab === 'artists' ? 'tab-active' : ''}`} onClick={() => setActiveTab('artists')}>Artists</a>
                <a role="tab" className={`tab ${activeTab === 'settings' ? 'tab-active' : ''}`} onClick={() => setActiveTab('settings')}>Settings</a>
                <a role="tab" className={`tab ${activeTab === 'system' ? 'tab-active' : ''}`} onClick={() => setActiveTab('system')}>System</a>
                <a role="tab" className={`tab ${activeTab === 'identity' ? 'tab-active' : ''}`} onClick={() => setActiveTab('identity')}>Identity</a>
                <a role="tab" className={`tab ${activeTab === 'activitypub' ? 'tab-active' : ''}`} onClick={() => setActiveTab('activitypub')}>ActivityPub</a>
            </div>

            <div className="bg-base-100 p-6 rounded-b-box border-x border-b border-base-300 min-h-[400px]">
                {activeTab === 'system' && (
                    <div className="space-y-6">
                        <h3 className="font-bold text-lg">System Maintenance</h3>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="card bg-base-200 border border-white/5">
                                <div className="card-body">
                                    <h2 className="card-title"><RefreshCw/> Library Scan</h2>
                                    <p className="opacity-70 text-sm">Scan the filesystem for new or modified files and update the database.</p>
                                    <div className="card-actions justify-end mt-4">
                                        <button className="btn btn-primary" onClick={() => handleSystemAction('scan')}>Scan Now</button>
                                    </div>
                                </div>
                            </div>
                            <div className="card bg-base-200 border border-white/5">
                                <div className="card-body">
                                    <h2 className="card-title"><Database/> Consolidate</h2>
                                    <p className="opacity-70 text-sm">Organize library files, generate waveforms, and cleanup orphan entries.</p>
                                    <div className="card-actions justify-end mt-4">
                                        <button className="btn btn-secondary" onClick={() => handleSystemAction('consolidate')}>Consolidate</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                
                {activeTab === 'overview' && (
                    <div className="space-y-6">
                        <h3 className="font-bold text-lg">Quick Actions</h3>
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                            <button 
                                className="btn btn-primary gap-2" 
                                onClick={() => document.dispatchEvent(new CustomEvent('open-upload-tracks-modal'))}
                            >
                                📤 Upload Tracks
                            </button>
                            <button 
                                className="btn btn-secondary gap-2" 
                                onClick={() => document.dispatchEvent(new CustomEvent('open-admin-release-modal'))}
                            >
                                💿 New Release
                            </button>
                            <button 
                                className="btn btn-outline gap-2" 
                                onClick={() => document.dispatchEvent(new CustomEvent('open-admin-artist-modal'))}
                            >
                                👤 New Artist
                            </button>
                            <button 
                                className="btn btn-outline gap-2" 
                                onClick={() => document.dispatchEvent(new CustomEvent('open-create-post-modal'))}
                            >
                                📝 New Post
                            </button>
                        </div>
                        <div className="divider"></div>
                        <div className="text-center opacity-50 py-8">
                            <BarChart2 size={48} className="mx-auto mb-4"/>
                            <p>More detailed analytics coming soon.</p>
                        </div>
                    </div>
                )}


                {activeTab === 'users' && (
                     <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="font-bold text-lg">User Management</h3>
                            <button className="btn btn-sm btn-primary" onClick={() => document.dispatchEvent(new CustomEvent('open-admin-user-modal'))}>Add User</button>
                        </div>
                        <AdminUsersList />
                     </div>
                )}

                {activeTab === 'artists' && (
                     <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="font-bold text-lg">Artist Management</h3>
                             <button className="btn btn-sm btn-primary" onClick={() => document.dispatchEvent(new CustomEvent('open-admin-artist-modal'))}>Add Artist</button>
                        </div>
                        <AdminArtistsList />
                     </div>
                )}

                 {activeTab === 'content' && (
                     <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="font-bold text-lg">Releases</h3>
                            <div className="flex gap-2">
                                <button className="btn btn-sm btn-outline" onClick={() => document.dispatchEvent(new CustomEvent('open-create-post-modal'))}>Create Post</button>
                                <button className="btn btn-sm btn-primary" onClick={() => document.dispatchEvent(new CustomEvent('open-admin-release-modal'))}>Create Release</button>
                            </div>
                        </div>
                        <AdminReleasesList />
                     </div>
                )}

                {activeTab === 'tracks' && <AdminTracksList />}
                
                {activeTab === 'settings' && <AdminSettingsPanel />}
                {activeTab === 'identity' && <IdentityPanel />}
                {activeTab === 'activitypub' && <ActivityPubPanel />}
            </div>
            
            <AdminUserModal onUserUpdated={() => window.dispatchEvent(new CustomEvent('refresh-admin-users'))} />
            <AdminArtistModal onArtistUpdated={() => window.dispatchEvent(new CustomEvent('refresh-admin-artists'))} />
            <AdminReleaseModal onReleaseUpdated={() => window.dispatchEvent(new CustomEvent('refresh-admin-releases'))} />
            <UploadTracksModal onUploadComplete={() => window.dispatchEvent(new CustomEvent('refresh-admin-releases'))} />
            <CreatePostModal onPostCreated={() => window.dispatchEvent(new CustomEvent('refresh-admin-releases'))} />
        </div>
    );
};

const AdminSettingsPanel = () => {
    const [settings, setSettings] = useState<SiteSettings | null>(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [bgFile, setBgFile] = useState<File | null>(null);
    const [coverFile, setCoverFile] = useState<File | null>(null);

    useEffect(() => {
        API.getSiteSettings().then(setSettings).catch(console.error);
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!settings) return;
        setLoading(true);
        setMessage('');
        try {
            await API.updateSettings(settings);
            
            if (bgFile) {
                await API.uploadBackgroundImage(bgFile);
            }
            if (coverFile) {
                await API.uploadSiteCover(coverFile);
            }

            setMessage('Settings saved successfully.');
            setBgFile(null);
            setCoverFile(null);
            // Refresh settings to get new bg url if needed
            API.getSiteSettings().then(setSettings);
        } catch (e) {
            console.error(e);
            setMessage('Failed to save settings.');
        } finally {
            setLoading(false);
        }
    };

    if (!settings) return <div className="p-8 text-center opacity-50">Loading settings...</div>;

    return (
        <form onSubmit={handleSave} className="space-y-6 max-w-2xl">
            <h3 className="font-bold text-lg">Site Settings</h3>
            
            <div className="form-control">
                <label className="label">
                    <span className="label-text">Site Name</span>
                </label>
                <input 
                    type="text" 
                    className="input input-bordered" 
                    value={settings.siteName}
                    onChange={e => setSettings({...settings, siteName: e.target.value})}
                />
            </div>

            <div className="form-control">
                <label className="label">
                    <span className="label-text">Description</span>
                </label>
                <textarea 
                    className="textarea textarea-bordered h-24" 
                    value={settings.siteDescription || ''}
                    onChange={e => setSettings({...settings, siteDescription: e.target.value})}
                />
            </div>
            
             <div className="form-control">
                <label className="label">
                    <span className="label-text">Background Image URL</span>
                </label>
                <input 
                    type="text" 
                    className="input input-bordered" 
                    value={settings.backgroundImage || ''}
                    onChange={e => setSettings({...settings, backgroundImage: e.target.value})}
                    placeholder="/images/bg.jpg"
                />
            </div>
            
            <div className="form-control">
                <label className="label">
                    <span className="label-text">Upload Background</span>
                </label>
                <input 
                    type="file" 
                    className="file-input file-input-bordered w-full"
                    accept="image/*"
                    onChange={e => setBgFile(e.target.files ? e.target.files[0] : null)}
                />
            </div>

            <div className="form-control">
                <label className="label">
                    <span className="label-text">Site Cover (Network List Image)</span>
                    <span className="label-text-alt opacity-50">Displayed on other nodes</span>
                </label>
                <input 
                    type="file" 
                    className="file-input file-input-bordered w-full"
                    accept="image/*"
                    onChange={e => setCoverFile(e.target.files ? e.target.files[0] : null)}
                />
            </div>

            <div className="form-control">
                <label className="label cursor-pointer justify-start gap-4">
                    <span className="label-text">Allow Public Registration</span>
                    <input 
                        type="checkbox" 
                        className="toggle toggle-primary"
                        checked={settings.allowPublicRegistration || false}
                        onChange={e => setSettings({...settings, allowPublicRegistration: e.target.checked})}
                    />
                </label>
            </div>

            <div className="pt-4">
                {message && <div className={`mb-4 text-sm ${message.includes('Failed') ? 'text-error' : 'text-success'}`}>{message}</div>}
                
                <button type="submit" className="btn btn-primary gap-2" disabled={loading}>
                    <Save size={16} /> Save Changes
                </button>
            </div>
        </form>
    );
};

// Sub-components for Admin Tabs (Internal for now)
const AdminUsersList = () => {
    const [users, setUsers] = useState<any[]>([]);
    
    const loadUsers = () => API.getUsers().then(setUsers).catch(console.error);

    useEffect(() => {
        loadUsers();
        window.addEventListener('refresh-admin-users', loadUsers);
        return () => window.removeEventListener('refresh-admin-users', loadUsers);
    }, []);

    const handleDelete = async (id: string, username: string) => {
        if (!confirm(`Are you sure you want to delete user ${username}? This cannot be undone.`)) return;
        try {
            await API.deleteUser(id);
            loadUsers();
        } catch (e) {
            console.error(e);
            alert('Failed to delete user');
        }
    };

    if (users.length === 0) return <div className="opacity-50 text-center py-4">No users found.</div>;

    return (
        <table className="table">
            <thead>
                <tr><th>Username</th><th>Role</th><th>Linked Artist</th><th>Created</th><th>Actions</th></tr>
            </thead>
            <tbody>
                {users.map(u => (
                    <tr key={u.id}>
                        <td className="font-bold">{u.username}</td>
                        <td>{u.isAdmin ? <span className="badge badge-primary badge-outline">Admin</span> : <span className="badge badge-ghost">User</span>}</td>
                        <td className="opacity-70">
                            {u.artist_id ? (
                                <span className="flex items-center gap-1"><User size={12}/> {u.artist_name || 'Linked'}</span>
                            ) : '-'}
                        </td>
                        <td className="opacity-50">{new Date(u.createdAt).toLocaleDateString()}</td>
                        <td className="flex gap-2">
                            <button 
                                className="btn btn-xs btn-ghost" 
                                onClick={() => document.dispatchEvent(new CustomEvent('open-admin-user-modal', { detail: u }))}
                            >
                                Edit
                            </button>
                            <button 
                                className="btn btn-xs btn-ghost text-error"
                                onClick={() => handleDelete(u.id, u.username)}
                            >
                                Delete
                            </button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
};

const AdminArtistsList = () => {
    const [artists, setArtists] = useState<any[]>([]);

    const loadArtists = () => API.getArtists().then(setArtists).catch(console.error);

    useEffect(() => {
        loadArtists();
        window.addEventListener('refresh-admin-artists', loadArtists);
        return () => window.removeEventListener('refresh-admin-artists', loadArtists);
    }, []);

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Are you sure you want to delete artist ${name}? This cannot be undone.`)) return;
        try {
            await API.deleteArtist(id);
            loadArtists();
        } catch (e) {
            console.error(e);
            alert('Failed to delete artist');
        }
    };

    if (artists.length === 0) return <div className="opacity-50 text-center py-4">No artists found.</div>;

    return (
        <table className="table">
            <thead>
                <tr><th>Name</th><th>Slug</th><th>Links</th><th>Actions</th></tr>
            </thead>
            <tbody>
                {artists.map(a => (
                    <tr key={a.id}>
                        <td className="font-bold flex items-center gap-2">
                            {a.photo_path && <div className="avatar w-8 h-8 rounded-full overflow-hidden"><img src={API.getArtistCoverUrl(a.id)} /></div>}
                            {a.name}
                        </td>
                        <td className="opacity-70">{a.slug}</td>
                        <td className="opacity-50 text-xs">
                             <div className="flex gap-1">
                                {a.links && (typeof a.links === 'string' ? JSON.parse(a.links) : a.links)?.map((l: any, i: number) => (
                                    <span key={i} className="badge badge-xs">{l.platform}</span>
                                ))}
                            </div>
                        </td>
                        <td className="flex gap-2">
                            <button
                                className="btn btn-xs btn-ghost"
                                onClick={() => document.dispatchEvent(new CustomEvent('open-artist-keys-modal', { detail: { artistId: String(a.id), artistName: a.name } }))}
                                title="Chiavi ActivityPub"
                            >
                                Keys
                            </button>
                            <button 
                                className="btn btn-xs btn-ghost" 
                                onClick={() => document.dispatchEvent(new CustomEvent('open-admin-artist-modal', { detail: a }))}
                            >
                                Edit
                            </button>
                            <button 
                                className="btn btn-xs btn-ghost text-error"
                                onClick={() => handleDelete(a.id, a.name)}
                            >
                                Delete
                            </button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
};

const AdminReleasesList = () => {
    const [releases, setReleases] = useState<any[]>([]);
    useEffect(() => {
        const loadReleases = () => API.getAdminReleases().then(setReleases).catch(console.error);
        loadReleases();
        window.addEventListener('refresh-admin-releases', loadReleases);
        return () => window.removeEventListener('refresh-admin-releases', loadReleases);
    }, []);

    if (releases.length === 0) return <div className="opacity-50 text-center py-4">No releases found.</div>;

    return (
        <table className="table">
            <thead>
                <tr><th>Title</th><th>Artist</th><th>Type</th><th>Actions</th></tr>
            </thead>
            <tbody>
                {releases.map(r => (
                    <tr key={r.id}>
                        <td className="font-bold">{r.title}</td>
                        <td>{r.artistName}</td>
                        <td><div className="badge badge-sm">{r.type}</div></td>
                        <td className="flex gap-2">
                            <button className="btn btn-xs btn-ghost" onClick={() => document.dispatchEvent(new CustomEvent('open-admin-release-modal', { detail: r }))}>Edit</button>
                            <button className="btn btn-xs btn-ghost text-secondary" onClick={() => document.dispatchEvent(new CustomEvent('open-upload-tracks-modal', { detail: { slug: r.slug || r.id, title: r.title }}))}>Upload Tracks</button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
};

const AdminTracksList = () => {
    const [tracks, setTracks] = useState<any[]>([]);

    const loadTracks = () => API.getTracks().then(setTracks).catch(console.error);

    useEffect(() => {
        loadTracks();
        window.addEventListener('refresh-admin-tracks', loadTracks);
        return () => window.removeEventListener('refresh-admin-tracks', loadTracks);
    }, []);

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Are you sure you want to delete track ${name}? This cannot be undone.`)) return;
        try {
            await API.deleteTrack(id, true);
            loadTracks();
        } catch (e) {
            console.error(e);
            alert('Failed to delete track');
        }
    };

    if (tracks.length === 0) return <div className="opacity-50 text-center py-4">No tracks found.</div>;

    return (
        <table className="table">
            <thead>
                <tr><th>Title</th><th>Artist</th><th>Album</th><th>Duration</th><th>Actions</th></tr>
            </thead>
            <tbody>
                {tracks.map(t => (
                    <tr key={t.id}>
                        <td className="font-bold">{t.title}</td>
                        <td>{t.artist_name}</td>
                        <td>{t.album_title}</td>
                        <td>{t.duration ? `${Math.floor(t.duration / 60)}:${String(Math.floor(t.duration % 60)).padStart(2, '0')}` : '-'}</td>
                        <td className="flex gap-2">
                            <button 
                                className="btn btn-xs btn-ghost text-error"
                                onClick={() => handleDelete(t.id, t.title)}
                            >
                                Delete
                            </button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
};

export default Admin;
