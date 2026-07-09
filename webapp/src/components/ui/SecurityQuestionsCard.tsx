import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import API from '../../services/api';
import { notify } from '../../utils/notify';

export const SecurityQuestionsCard = () => {
    const [q1, setQ1] = useState('');
    const [a1, setA1] = useState('');
    const [q2, setQ2] = useState('');
    const [a2, setA2] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await API.setSecurityQuestions(q1, a1, q2, a2);
            notify.success('Security questions updated successfully');
            setQ1('');
            setA1('');
            setQ2('');
            setA2('');
        } catch (err: any) {
            notify.error(err, 'Failed to update security questions');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="card bg-base-200 border border-base-content/10 overflow-hidden mt-6">
            <div className="bg-base-200/40 p-6 border-b border-base-content/5">
                <h3 className="text-xl font-bold flex items-center gap-2">
                    <ShieldCheck size={20} className="text-primary" /> Security Questions
                </h3>
                <p className="text-xs opacity-50 mt-1">
                    Set two security questions to recover your password if email is not available.
                </p>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-w-md">
                <div className="form-control">
                    <label className="label">
                        <span className="label-text text-xs font-bold opacity-40">Question 1</span>
                    </label>
                    <input
                        type="text"
                        className="input input-bordered focus:border-primary transition-all"
                        value={q1}
                        onChange={e => setQ1(e.target.value)}
                        placeholder="e.g. What is your mother's maiden name?"
                        required
                    />
                </div>
                <div className="form-control">
                    <label className="label">
                        <span className="label-text text-xs font-bold opacity-40">Answer 1</span>
                    </label>
                    <input
                        type="text"
                        className="input input-bordered focus:border-primary transition-all"
                        value={a1}
                        onChange={e => setA1(e.target.value)}
                        required
                    />
                </div>
                <div className="form-control">
                    <label className="label">
                        <span className="label-text text-xs font-bold opacity-40">Question 2</span>
                    </label>
                    <input
                        type="text"
                        className="input input-bordered focus:border-primary transition-all"
                        value={q2}
                        onChange={e => setQ2(e.target.value)}
                        placeholder="e.g. What was the name of your first pet?"
                        required
                    />
                </div>
                <div className="form-control">
                    <label className="label">
                        <span className="label-text text-xs font-bold opacity-40">Answer 2</span>
                    </label>
                    <input
                        type="text"
                        className="input input-bordered focus:border-primary transition-all"
                        value={a2}
                        onChange={e => setA2(e.target.value)}
                        required
                    />
                </div>
                <button type="submit" className="btn btn-primary shadow-level-1" disabled={loading}>
                    {loading ? <span className="loading loading-spinner loading-xs" /> : <ShieldCheck size={16} />}
                    Save Questions
                </button>
            </form>
        </div>
    );
};
