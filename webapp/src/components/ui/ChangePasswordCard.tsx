import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import API from '../../services/api';
import { notify } from '../../utils/notify';
import { useAuthStore } from '../../stores/useAuthStore';

export const ChangePasswordCard = () => {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPass, setConfirmPass] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (newPassword !== confirmPass) {
            notify.error(null, 'New passwords do not match');
            return;
        }

        setLoading(true);
        try {
            const res: any = await API.changePassword(currentPassword, newPassword);
            // The server bumps the token version, so the old token is now invalid
            if (res?.token) API.setToken(res.token);
            // The Zen identity vault is sealed with the old password until it is
            // re-wrapped — skip this and the next login can't open it, taking the
            // user's chat identity and every DM sent to it with it.
            try {
                await useAuthStore.getState().resealChatIdentity(newPassword);
            } catch {
                notify.error(null, 'Password changed, but re-encrypting your chat identity failed. Log out and back in before changing it again.');
            }
            notify.success('Password changed successfully');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPass('');
        } catch (err: any) {
            notify.error(err, 'Failed to change password');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="card bg-base-200 border border-base-content/10 overflow-hidden">
            <div className="bg-base-200/40 p-6 border-b border-base-content/5">
                <h3 className="text-xl font-bold flex items-center gap-2">
                    <KeyRound size={20} className="text-warning" /> Change Password
                </h3>
                <p className="text-xs opacity-50 mt-1">
                    Update the password you use to log in to this instance.
                </p>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-w-md">
                <div className="form-control">
                    <label className="label">
                        <span className="label-text text-xs font-bold opacity-40">Current Password</span>
                    </label>
                    <input
                        type="password"
                        className="input input-bordered focus:border-primary transition-all"
                        value={currentPassword}
                        onChange={e => setCurrentPassword(e.target.value)}
                        autoComplete="current-password"
                        required
                    />
                </div>
                <div className="form-control">
                    <label className="label">
                        <span className="label-text text-xs font-bold opacity-40">New Password</span>
                    </label>
                    <input
                        type="password"
                        className="input input-bordered focus:border-primary transition-all"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        autoComplete="new-password"
                        required
                        minLength={6}
                    />
                </div>
                <div className="form-control">
                    <label className="label">
                        <span className="label-text text-xs font-bold opacity-40">Confirm New Password</span>
                    </label>
                    <input
                        type="password"
                        className="input input-bordered focus:border-primary transition-all"
                        value={confirmPass}
                        onChange={e => setConfirmPass(e.target.value)}
                        autoComplete="new-password"
                        required
                    />
                </div>
                <button type="submit" className="btn btn-primary shadow-level-1" disabled={loading}>
                    {loading ? <span className="loading loading-spinner loading-xs" /> : <KeyRound size={16} />}
                    Update Password
                </button>
            </form>
        </div>
    );
};
