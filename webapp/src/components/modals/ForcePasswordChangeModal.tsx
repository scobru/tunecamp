import { useState } from 'react';
import React from 'react';
import { useAuthStore } from '../../stores/useAuthStore';
import API from '../../services/api';
import { ShieldAlert } from 'lucide-react';

export const ForcePasswordChangeModal = () => {
    const { mustChangePassword, checkAuth, logout } = useAuthStore();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPass, setConfirmPass] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    if (!mustChangePassword) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (newPassword !== confirmPass) {
            setError('New passwords do not match');
            return;
        }

        if (newPassword.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        setLoading(true);
        try {
            await API.changePassword(currentPassword, newPassword);
            // Refresh auth status to clear the flag
            await checkAuth();
        } catch (e: any) {
            setError(e.message || 'Failed to change password');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal modal-open bg-black/80 backdrop-blur-sm z-[100]">
            <div className="modal-box border border-error/20 shadow-2xl">
                <h3 className="font-bold text-lg text-error flex items-center gap-2">
                    <ShieldAlert /> Security Alert
                </h3>
                <p className="py-4">
                    You are using the default admin password. For security reasons, you must change it immediately.
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="form-control">
                        <label className="label"><span className="label-text">Current Password</span></label>
                        <input
                            type="password"
                            className="input input-bordered w-full"
                            value={currentPassword}
                            onChange={e => setCurrentPassword(e.target.value)}
                            required
                            placeholder="tunecamp"
                        />
                    </div>

                    <div className="form-control">
                        <label className="label"><span className="label-text">New Password</span></label>
                        <input
                            type="password"
                            className="input input-bordered w-full"
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            required
                            minLength={6}
                        />
                    </div>

                    <div className="form-control">
                        <label className="label"><span className="label-text">Confirm New Password</span></label>
                        <input
                            type="password"
                            className="input input-bordered w-full"
                            value={confirmPass}
                            onChange={e => setConfirmPass(e.target.value)}
                            required
                        />
                    </div>

                    {error && <div className="text-error text-sm">{error}</div>}

                    <div className="modal-action">
                        <button type="button" className="btn btn-ghost" onClick={logout}>Log Out</button>
                        <button type="submit" className="btn btn-error" disabled={loading}>
                            {loading ? <span className="loading loading-spinner"></span> : 'Change Password'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

