import { useState, useEffect } from 'react';
import API from '../services/api';
import { useAuthStore } from '../stores/useAuthStore';
import { useNavigate } from 'react-router-dom';
import { BarChart2, Users, Settings, Database, Server, RefreshCw } from 'lucide-react';
import { GleamUtils } from '../utils/gleam';

export const Admin = () => {
    const { user, isAuthenticated } = useAuthStore();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'overview' | 'content' | 'users' | 'settings' | 'system'>('overview');
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isAuthenticated || !user?.isAdmin) {
             navigate('/');
             return;
        }
        loadStats();
    }, [isAuthenticated, user]);

    const loadStats = async () => {
        setLoading(true);
        try {
            const data = await API.getAdminStats();
            setStats(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
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
                            <button className="btn btn-sm btn-primary">Add User</button>
                        </div>
                        <AdminUsersList />
                     </div>
                )}

                 {activeTab === 'content' && (
                     <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="font-bold text-lg">Releases</h3>
                            <button className="btn btn-sm btn-primary">Create Release</button>
                        </div>
                        <AdminReleasesList />
                     </div>
                )}
                
                {activeTab === 'settings' && (
                     <div className="text-center opacity-50 py-12">
                        <Settings size={48} className="mx-auto mb-4"/>
                        <p>Site settings (Name, Description, Public Access) coming soon.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

// Sub-components for Admin Tabs (Internal for now)
const AdminUsersList = () => {
    const [users, setUsers] = useState<any[]>([]);
    useEffect(() => {
        API.getUsers().then(setUsers).catch(console.error);
    }, []);

    if (users.length === 0) return <div className="opacity-50 text-center py-4">No users found.</div>;

    return (
        <table className="table">
            <thead>
                <tr><th>Username</th><th>Admin</th><th>Created</th><th>Actions</th></tr>
            </thead>
            <tbody>
                {users.map(u => (
                    <tr key={u.id}>
                        <td className="font-bold">{u.username}</td>
                        <td>{u.isAdmin ? 'Yes' : 'No'}</td>
                        <td className="opacity-50">{new Date(u.createdAt).toLocaleDateString()}</td>
                        <td><button className="btn btn-xs btn-ghost text-error">Delete</button></td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
};

const AdminReleasesList = () => {
    const [releases, setReleases] = useState<any[]>([]);
    useEffect(() => {
        API.getAdminReleases().then(setReleases).catch(console.error);
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
                        <td><button className="btn btn-xs btn-ghost">Edit</button></td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
};

export default Admin;
