import { useState, useEffect } from 'react';
import API from '../services/api';
import { useAuthStore } from '../stores/useAuthStore';
import { useNavigate } from 'react-router-dom';
import { BarChart2, Settings, Database, RefreshCw, Save, User } from 'lucide-react';
import { AdminUserModal } from '../components/modals/AdminUserModal';
import { AdminReleaseModal } from '../components/modals/AdminReleaseModal';
import { UploadTracksModal } from '../components/modals/UploadTracksModal';
import { IdentityPanel } from '../components/admin/IdentityPanel';
import type { SiteSettings } from '../types';

export const Admin = () => {
    const { user, isAuthenticated } = useAuthStore();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'overview' | 'content' | 'users' | 'settings' | 'system' | 'identity'>('overview');
    const [stats, setStats] = useState<any>(null);
    // const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isAuthenticated || !user?.isAdmin) {
             navigate('/');
             return;
        }
        loadStats();
    }, [isAuthenticated, user]);

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

    if (!user?.isAdmin) return null;

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
                <a role="tab" className={`tab ${activeTab === 'users' ? 'tab-active' : ''}`} onClick={() => setActiveTab('users')}>Users</a>
                <a role="tab" className={`tab ${activeTab === 'settings' ? 'tab-active' : ''}`} onClick={() => setActiveTab('settings')}>Settings</a>
                <a role="tab" className={`tab ${activeTab === 'system' ? 'tab-active' : ''}`} onClick={() => setActiveTab('system')}>System</a>
                <a role="tab" className={`tab ${activeTab === 'identity' ? 'tab-active' : ''}`} onClick={() => setActiveTab('identity')}>Identity</a>
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
                    <div className="text-center opacity-50 py-12">
                        <BarChart2 size={48} className="mx-auto mb-4"/>
                        <p>More detailed analytics coming soon.</p>
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

                 {activeTab === 'content' && (
                     <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="font-bold text-lg">Releases</h3>
                            <button className="btn btn-sm btn-primary" onClick={() => document.dispatchEvent(new CustomEvent('open-admin-release-modal'))}>Create Release</button>
                        </div>
                        <AdminReleasesList />
                     </div>
                )}
                
                {activeTab === 'settings' && <AdminSettingsPanel />}
                {activeTab === 'identity' && <IdentityPanel />}
            </div>
            
            <AdminUserModal onUserUpdated={() => window.dispatchEvent(new CustomEvent('refresh-admin-users'))} />
            <AdminReleaseModal onReleaseUpdated={() => window.dispatchEvent(new CustomEvent('refresh-admin-releases'))} />
            <UploadTracksModal onUploadComplete={() => window.dispatchEvent(new CustomEvent('refresh-admin-releases'))} />
        </div>
    );
};

const AdminSettingsPanel = () => {
    const [settings, setSettings] = useState<SiteSettings | null>(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [bgFile, setBgFile] = useState<File | null>(null);

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

            setMessage('Settings saved successfully.');
            setBgFile(null);
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
    useEffect(() => {
        const loadUsers = () => API.getUsers().then(setUsers).catch(console.error);
        loadUsers();
        window.addEventListener('refresh-admin-users', loadUsers);
        return () => window.removeEventListener('refresh-admin-users', loadUsers);
    }, []);

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
                            {u.artistId ? (
                                <span className="flex items-center gap-1"><User size={12}/> {u.artistName || 'Linked'}</span>
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
                            <button className="btn btn-xs btn-ghost text-error">Delete</button>
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

export default Admin;
