import { useState, useEffect } from 'react';
import React from 'react';
import { useAuthStore } from '../../stores/useAuthStore';
import API from '../../services/api';
import { ShieldAlert, Music } from 'lucide-react';

export const SetupWizardModal = () => {
    const { mustChangePassword, checkAuth, logout } = useAuthStore();
    const [step, setStep] = useState(1);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPass, setConfirmPass] = useState('');
    
    // Site Identity
    const [siteName, setSiteName] = useState('');
    const [siteDescription, setSiteDescription] = useState('');


    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (mustChangePassword) {
            setStep(1);
        }
    }, [mustChangePassword]);

    if (!mustChangePassword) return null;

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (newPassword !== confirmPass) {
            setError('New passwords do not match');
            return;
        }

        setLoading(true);
        try {
            await API.changePassword(currentPassword, newPassword);
            setStep(2);
        } catch (e: any) {
            setError(e.message || 'Failed to change password');
        } finally {
            setLoading(false);
        }
    };

    const handleIdentitySubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const settingsToUpdate: any = {};
            if (siteName) settingsToUpdate.siteName = siteName;
            if (siteDescription) settingsToUpdate.siteDescription = siteDescription;
            
            if (Object.keys(settingsToUpdate).length > 0) {
                await API.updateSettings(settingsToUpdate);
            }
            
            await checkAuth(); // Finalize and close modal
        } catch (e: any) {
            setError(e.message || 'Failed to save settings');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal modal-open bg-black/90 backdrop-blur-md z-[100]">
            <div className="modal-box border border-primary/20 shadow-level-1 max-w-md">
                
                {/* Steps Indicator */}
                <ul className="steps w-full mb-8">
                    <li className={`step ${step >= 1 ? 'step-primary' : ''}`}>Security</li>
                    <li className={`step ${step >= 2 ? 'step-primary' : ''}`}>Identity</li>
                </ul>

                {step === 1 && (
                    <>
                        <h3 className="font-bold text-2xl flex items-center gap-2 mb-2">
                            <ShieldAlert className="text-error" /> Secure your instance
                        </h3>
                        <p className="text-base-content/70 mb-6">
                            You are currently using the default password. Let's change it to something secure before you proceed.
                        </p>

                        <form onSubmit={handlePasswordSubmit} className="space-y-4">
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

                            {error && <div className="alert alert-error text-sm py-2">{error}</div>}

                            <div className="modal-action">
                                <button type="button" className="btn btn-ghost" onClick={logout}>Log Out</button>
                                <button type="submit" className="btn btn-primary px-8" disabled={loading}>
                                    {loading ? <span className="loading loading-spinner"></span> : 'Next Step'}
                                </button>
                            </div>
                        </form>
                    </>
                )}

                {step === 2 && (
                    <>
                        <h3 className="font-bold text-2xl flex items-center gap-2 mb-2">
                            <Music className="text-primary" /> TuneCamp Identity
                        </h3>
                        <p className="text-base-content/70 mb-6">
                            Give your music instance a name and description. This is how others will see you in the network.
                        </p>

                        <form onSubmit={handleIdentitySubmit} className="space-y-4">
                            <div className="form-control">
                                <label className="label"><span className="label-text font-semibold">Site Name</span></label>
                                <input
                                    type="text"
                                    className="input input-bordered w-full"
                                    value={siteName}
                                    onChange={e => setSiteName(e.target.value)}
                                    placeholder="e.g. My Awesome Records"
                                />
                            </div>

                            <div className="form-control">
                                <label className="label"><span className="label-text font-semibold">Description</span></label>
                                <textarea
                                    className="textarea textarea-bordered w-full h-24"
                                    value={siteDescription}
                                    onChange={e => setSiteDescription(e.target.value)}
                                    placeholder="Tell the world about your music..."
                                />
                            </div>

                            {error && <div className="alert alert-error text-sm py-2">{error}</div>}

                            <div className="modal-action flex justify-between">
                                <button type="button" className="btn btn-link" onClick={() => checkAuth()}>Skip for now</button>
                                <button type="submit" className="btn btn-primary px-8" disabled={loading}>
                                    {loading ? <span className="loading loading-spinner"></span> : 'Finish Setup'}
                                </button>
                            </div>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
};
