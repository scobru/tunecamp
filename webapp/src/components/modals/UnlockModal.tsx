import { useState, useRef, useEffect } from 'react';
import API from '../../services/api';
import { Lock, Unlock } from 'lucide-react';

export const UnlockModal = () => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const handleOpen = () => {
            setCode('');
            setError('');
            setSuccess('');
            dialogRef.current?.showModal();
        };

        document.addEventListener('open-unlock-modal', handleOpen);
        return () => document.removeEventListener('open-unlock-modal', handleOpen);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');

        try {
            await API.redeemUnlockCode(code);
            setSuccess('Code redeemed successfully! Downloads unlocked.');
            // Maybe refresh page or trigger download?
            setTimeout(() => dialogRef.current?.close(), 2000);
        } catch (e: any) {
            setError(e.message || 'Invalid code');
        } finally {
            setLoading(false);
        }
    };

    return (
        <dialog id="unlock-modal" className="modal" ref={dialogRef}>
            <div className="modal-box bg-base-100 border border-white/5 max-w-sm">
                <form method="dialog">
                    <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
                </form>
                
                <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                    <Unlock size={20}/> Redeem Code
                </h3>

                <p className="text-sm opacity-70 mb-4">
                    Enter your unlock code to access premium content or downloads.
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <input 
                        type="text" 
                        placeholder="XXXX-XXXX" 
                        className="input input-bordered w-full font-mono uppercase text-center tracking-widest" 
                        value={code}
                        onChange={e => setCode(e.target.value.toUpperCase())}
                        required
                    />
                    
                    {error && <div className="text-error text-sm text-center">{error}</div>}
                    {success && <div className="text-success text-sm text-center">{success}</div>}

                    <button type="submit" className="btn btn-primary w-full" disabled={loading}>
                        {loading ? 'Verifying...' : 'Unlock'}
                    </button>
                </form>
            </div>
            <form method="dialog" className="modal-backdrop">
                <button>close</button>
            </form>
        </dialog>
    );
};
