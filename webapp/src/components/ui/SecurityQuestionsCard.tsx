import { useState } from 'react';
import { ShieldQuestion } from 'lucide-react';
import API from '../../services/api';
import { notify } from '../../utils/notify';
import { DEFAULT_SECURITY_QUESTIONS } from '../../constants/securityQuestions';
import { useAuthStore } from '../../stores/useAuthStore';

export const SecurityQuestionsCard = () => {
    const { user } = useAuthStore();
    const [question1, setQuestion1] = useState(DEFAULT_SECURITY_QUESTIONS[0]);
    const [answer1, setAnswer1] = useState('');
    const [question2, setQuestion2] = useState(DEFAULT_SECURITY_QUESTIONS[1]);
    const [answer2, setAnswer2] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (question1 === question2) {
            notify.error(null, 'Choose two different questions');
            return;
        }

        setLoading(true);
        try {
            await API.setSecurityQuestions({ question1, answer1, question2, answer2 });
            notify.success('Security questions saved');
            setAnswer1('');
            setAnswer2('');
        } catch (err: any) {
            notify.error(err, 'Failed to save security questions');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="card bg-base-200 border border-base-content/10 overflow-hidden">
            <div className="bg-base-200/40 p-6 border-b border-base-content/5">
                <h3 className="text-xl font-bold flex items-center gap-2">
                    <ShieldQuestion size={20} className="text-info" /> Security Questions
                </h3>
                <p className="text-xs opacity-50 mt-1">
                    {user?.securityQuestionsConfigured
                        ? 'Already configured — saving again replaces both questions.'
                        : 'A password recovery fallback for when email reset isn\'t available on this instance.'}
                </p>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-w-md">
                <div className="form-control">
                    <label className="label">
                        <span className="label-text text-xs font-bold opacity-40">Question 1</span>
                    </label>
                    <select className="select select-bordered" value={question1} onChange={e => setQuestion1(e.target.value)}>
                        {DEFAULT_SECURITY_QUESTIONS.map(q => <option key={q} value={q}>{q}</option>)}
                    </select>
                    <input
                        type="text"
                        placeholder="Your answer"
                        className="input input-bordered mt-2"
                        value={answer1}
                        onChange={e => setAnswer1(e.target.value)}
                        required
                    />
                </div>
                <div className="form-control">
                    <label className="label">
                        <span className="label-text text-xs font-bold opacity-40">Question 2</span>
                    </label>
                    <select className="select select-bordered" value={question2} onChange={e => setQuestion2(e.target.value)}>
                        {DEFAULT_SECURITY_QUESTIONS.map(q => <option key={q} value={q}>{q}</option>)}
                    </select>
                    <input
                        type="text"
                        placeholder="Your answer"
                        className="input input-bordered mt-2"
                        value={answer2}
                        onChange={e => setAnswer2(e.target.value)}
                        required
                    />
                </div>
                <button type="submit" className="btn btn-primary shadow-level-1" disabled={loading}>
                    {loading ? <span className="loading loading-spinner loading-xs" /> : <ShieldQuestion size={16} />}
                    Save Security Questions
                </button>
            </form>
        </div>
    );
};
