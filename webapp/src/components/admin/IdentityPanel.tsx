import { useState, useEffect } from 'react';
import API from '../../services/api';
import { Shield, Key, AlertTriangle, Save } from 'lucide-react';

export const IdentityPanel = () => {
    const [identity, setIdentity] = useState<{ pub: string, epub: string, alias: string } | null>(null);
    const [importData, setImportData] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        loadIdentity();
    }, []);

    const loadIdentity = async () => {
        try {
            const data = await API.getIdentity();
            setIdentity(data);
        } catch (e) {
            console.error('Failed to load identity', e);
        }
    };

    const handleImport = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!importData) return;
        
        if (!confirm('WARNING: Importing a new identity will replace the current node identity. Make sure you have a backup of the current one if you need it. Continue?')) {
            return;
        }

        setLoading(true);
        setError('');
        setSuccess('');

        try {
            let pair;
            try {
                pair = JSON.parse(importData);
            } catch (e) {
                throw new Error('Invalid JSON format');
            }

            await API.importIdentity(pair);
            setSuccess('Identity imported successfully. The node will restart with the new identity.');
            setImportData('');
            loadIdentity(); // Reload to show new identity
        } catch (e: any) {
            setError(e.message || 'Failed to import identity');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8 animate-fade-in max-w-4xl">
            <div className="flex items-center gap-3">
                 <Shield size={24} className="text-primary"/>
                 <h2 className="text-xl font-bold">Identity Management</h2>
            </div>
            
            <div className="grid gap-6 md:grid-cols-2">
                {/* Current Identity Card */}
                <div className="card bg-base-200 border border-white/5">
                    <div className="card-body">
                        <h3 className="card-title text-sm uppercase tracking-wider opacity-70 mb-4">Current Node Identity</h3>
                        
                        {identity ? (
                            <div className="space-y-4">
                                <div className="form-control">
                                    <label className="label">
                                        <span className="label-text text-xs">Public Key (pub)</span>
                                    </label>
                                    <div className="p-3 bg-base-300 rounded font-mono text-xs break-all select-all">
                                        {identity.pub}
                                    </div>
                                </div>
                                <div className="form-control">
                                    <label className="label">
                                        <span className="label-text text-xs">Encryption Key (epub)</span>
                                    </label>
                                    <div className="p-3 bg-base-300 rounded font-mono text-xs break-all select-all">
                                        {identity.epub}
                                    </div>
                                </div>
                                <div className="form-control">
                                    <label className="label">
                                        <span className="label-text text-xs">Alias</span>
                                    </label>
                                    <div className="p-3 bg-base-300 rounded font-mono text-sm">
                                        {identity.alias || 'N/A'}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="py-8 text-center opacity-50">
                                Loading identity...
                            </div>
                        )}
                    </div>
                </div>

                {/* Import Identity Card */}
                <div className="card bg-base-200 border border-warning/20">
                    <div className="card-body">
                        <h3 className="card-title text-sm uppercase tracking-wider text-warning mb-4 flex items-center gap-2">
                            <Key size={16}/> Import Identity
                        </h3>
                        
                        <div className="alert alert-warning shadow-lg text-xs mb-4">
                            <div>
                                <AlertTriangle size={16} />
                                <span>Paste a valid GunDB key pair (JSON) to restore a previous identity. This is a destructive action.</span>
                            </div>
                        </div>

                        <form onSubmit={handleImport} className="space-y-4">
                            <textarea 
                                className="textarea textarea-bordered w-full font-mono text-xs h-32" 
                                placeholder='{"pub":"...", "priv":"...", "epub":"...", "epriv":"..."}'
                                value={importData}
                                onChange={e => setImportData(e.target.value)}
                            ></textarea>

                            {error && <div className="text-error text-sm">{error}</div>}
                            {success && <div className="text-success text-sm">{success}</div>}

                            <div className="card-actions justify-end">
                                <button type="submit" className="btn btn-warning btn-sm gap-2" disabled={loading || !importData}>
                                    <Save size={16} /> Import Identity
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};
