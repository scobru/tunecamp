import { useState, useEffect } from 'react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/useAuthStore';
import API from '../../services/api';
import { ShieldAlert, Music } from 'lucide-react';

export const SetupWizardModal = () => {
    const { t } = useTranslation(['admin', 'common']);
    const { mustChangePassword, checkAuth, logout, user } = useAuthStore();
    const isRootAdmin = !!user?.isRootAdmin;
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
            setError(t('wizard.errors.passwordMismatch'));
            return;
        }

        setLoading(true);
        try {
            await API.changePassword(currentPassword, newPassword);
            if (isRootAdmin) {
                setStep(2);
            } else {
                await checkAuth(); // Non-root users only need the password step
            }
        } catch (e: any) {
            setError(e.message || t('wizard.errors.changePasswordFailed'));
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
            setError(e.message || t('wizard.errors.saveSettingsFailed'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal modal-open bg-black/90 backdrop-blur-md z-[100]">
            <div className="modal-box border border-primary/20 shadow-level-1 max-w-md">

                {/* Steps Indicator (root admin also configures the instance identity) */}
                {isRootAdmin && (
                    <ul className="steps w-full mb-8">
                        <li className={`step ${step >= 1 ? 'step-primary' : ''}`}>{t('wizard.steps.security')}</li>
                        <li className={`step ${step >= 2 ? 'step-primary' : ''}`}>{t('wizard.steps.identity')}</li>
                    </ul>
                )}

                {step === 1 && (
                    <>
                        <h3 className="font-bold text-2xl flex items-center gap-2 mb-2">
                            <ShieldAlert className="text-error" /> {isRootAdmin ? t('wizard.secureInstanceTitle') : t('wizard.secureAccountTitle')}
                        </h3>
                        <p className="text-base-content/70 mb-6">
                            {isRootAdmin ? t('wizard.defaultPasswordPrompt') : t('wizard.tempPasswordPrompt')}
                        </p>

                        <form onSubmit={handlePasswordSubmit} className="space-y-4">
                            <div className="form-control">
                                <label className="label"><span className="label-text">{t('wizard.currentPassword')}</span></label>
                                <input
                                    type="password"
                                    className="input input-bordered w-full"
                                    value={currentPassword}
                                    onChange={e => setCurrentPassword(e.target.value)}
                                    required
                                    placeholder={isRootAdmin ? 'tunecamp' : ''}
                                />
                            </div>

                            <div className="form-control">
                                <label className="label"><span className="label-text">{t('wizard.newPassword')}</span></label>
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
                                <label className="label"><span className="label-text">{t('wizard.confirmNewPassword')}</span></label>
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
                                <button type="button" className="btn btn-ghost" onClick={logout}>{t('common:logout')}</button>
                                <button type="submit" className="btn btn-primary px-8" disabled={loading}>
                                    {loading ? <span className="loading loading-spinner"></span> : (isRootAdmin ? t('common:nextStep') : t('common:saveAndContinue'))}
                                </button>
                            </div>
                        </form>
                    </>
                )}

                {step === 2 && (
                    <>
                        <h3 className="font-bold text-2xl flex items-center gap-2 mb-2">
                            <Music className="text-primary" /> {t('wizard.identityTitle')}
                        </h3>
                        <p className="text-base-content/70 mb-6">
                            {t('wizard.identityPrompt')}
                        </p>

                        <form onSubmit={handleIdentitySubmit} className="space-y-4">
                            <div className="form-control">
                                <label className="label"><span className="label-text font-semibold">{t('wizard.siteName')}</span></label>
                                <input
                                    type="text"
                                    className="input input-bordered w-full"
                                    value={siteName}
                                    onChange={e => setSiteName(e.target.value)}
                                    placeholder={t('wizard.siteNamePlaceholder')}
                                />
                            </div>

                            <div className="form-control">
                                <label className="label"><span className="label-text font-semibold">{t('wizard.description')}</span></label>
                                <textarea
                                    className="textarea textarea-bordered w-full h-24"
                                    value={siteDescription}
                                    onChange={e => setSiteDescription(e.target.value)}
                                    placeholder={t('wizard.descriptionPlaceholder')}
                                />
                            </div>

                            {error && <div className="alert alert-error text-sm py-2">{error}</div>}

                            <div className="modal-action flex justify-between">
                                <button type="button" className="btn btn-link" onClick={() => checkAuth()}>{t('common:skipForNow')}</button>
                                <button type="submit" className="btn btn-primary px-8" disabled={loading}>
                                    {loading ? <span className="loading loading-spinner"></span> : t('wizard.finishSetup')}
                                </button>
                            </div>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
};
