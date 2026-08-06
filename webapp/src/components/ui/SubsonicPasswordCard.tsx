import { useEffect, useState } from 'react';
import { Copy, Radio, ShieldCheck, Trash2 } from 'lucide-react';
import API from '../../services/api';
import { notify } from '../../utils/notify';
import { confirm } from '@/utils/confirm';

/**
 * Subsonic clients authenticate with `md5(password + salt)`, which forces the
 * server to keep a secret it can read back. It keeps this random per-user one
 * rather than the account password, so a database leak never exposes the
 * credential people reuse on other sites.
 */
export const SubsonicPasswordCard = () => {
    const [configured, setConfigured] = useState(false);
    const [loading, setLoading] = useState(true);
    const [working, setWorking] = useState(false);
    // Held in memory only, from the one response that carries it.
    const [newPassword, setNewPassword] = useState<string | null>(null);

    useEffect(() => {
        API.getSubsonicPasswordStatus()
            .then(res => setConfigured(!!res.configured))
            .catch(() => setConfigured(false))
            .finally(() => setLoading(false));
    }, []);

    const handleGenerate = async () => {
        if (
            configured &&
            !(await confirm(
                'This replaces your current Subsonic password. Any app already using it will stop working until you reconfigure it.',
            ))
        )
            return;

        setWorking(true);
        try {
            const res = await API.createSubsonicPassword();
            setNewPassword(res.appPassword);
            setConfigured(true);
        } catch (err: any) {
            notify.error(err, 'Failed to generate Subsonic password');
        } finally {
            setWorking(false);
        }
    };

    const handleRevoke = async () => {
        if (
            !(await confirm(
                'Remove your Subsonic password? Every Subsonic app signed in with it will lose access.',
            ))
        )
            return;

        setWorking(true);
        try {
            await API.revokeSubsonicPassword();
            setConfigured(false);
            setNewPassword(null);
            notify.success('Subsonic password removed');
        } catch (err: any) {
            notify.error(err, 'Failed to remove Subsonic password');
        } finally {
            setWorking(false);
        }
    };

    return (
        <div className="card bg-base-200 border border-base-content/10 overflow-hidden">
            <div className="bg-base-200/40 p-6 border-b border-base-content/5">
                <h3 className="text-xl font-bold flex items-center gap-2">
                    <Radio size={20} className="text-info" /> Subsonic Password
                </h3>
                <p className="text-xs opacity-50 mt-1">
                    A separate password for Subsonic apps. Use your username and this
                    password to sign in — not your account password.
                </p>
            </div>

            <div className="p-6 space-y-4 max-w-md">
                {newPassword && (
                    <div className="alert alert-warning bg-warning/10 border-warning/20 flex flex-col items-start gap-3 p-4 rounded-2xl">
                        <div className="flex gap-2 items-center text-warning font-bold">
                            <ShieldCheck size={18} />
                            <span>Copy it now</span>
                        </div>
                        <p className="text-sm opacity-90">
                            This password is not shown again. If you lose it, generate a new one.
                        </p>
                        <div className="flex gap-2 w-full">
                            <input
                                type="text"
                                readOnly
                                value={newPassword}
                                className="input input-bordered flex-1 font-mono text-sm bg-base-300"
                            />
                            <button
                                type="button"
                                className="btn btn-ghost btn-square tooltip tooltip-left"
                                onClick={() => {
                                    navigator.clipboard.writeText(newPassword);
                                    notify.success('Subsonic password copied!');
                                }}
                                data-tip="Copy password"
                            >
                                <Copy size={18} />
                            </button>
                            <button
                                type="button"
                                className="btn btn-sm btn-ghost self-center"
                                onClick={() => setNewPassword(null)}
                            >
                                Done
                            </button>
                        </div>
                    </div>
                )}

                {loading ? (
                    <span className="loading loading-spinner loading-sm" />
                ) : (
                    <>
                        <p className="text-sm opacity-60">
                            {configured
                                ? 'A Subsonic password is set for this account.'
                                : 'No Subsonic password yet. Generate one to connect a Subsonic app.'}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                className="btn btn-primary shadow-level-1"
                                onClick={handleGenerate}
                                disabled={working}
                            >
                                {working ? (
                                    <span className="loading loading-spinner loading-xs" />
                                ) : (
                                    <Radio size={16} />
                                )}
                                {configured ? 'Generate New Password' : 'Generate Password'}
                            </button>
                            {configured && (
                                <button
                                    type="button"
                                    className="btn btn-ghost text-error gap-2"
                                    onClick={handleRevoke}
                                    disabled={working}
                                >
                                    <Trash2 size={16} /> Remove
                                </button>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
