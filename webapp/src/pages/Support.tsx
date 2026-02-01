import { LifeBuoy, Mail, Book, Github } from 'lucide-react';

export const Support = () => {
    return (
        <div className="space-y-8 animate-fade-in max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold flex items-center gap-3">
                <LifeBuoy size={32} className="text-primary"/> Support
            </h1>

            <div className="grid md:grid-cols-2 gap-6">
                <div className="card bg-base-200 border border-white/5">
                    <div className="card-body">
                        <h2 className="card-title"><Book/> Documentation</h2>
                        <p className="opacity-70">Read the official TuneCamp guide to learn how to manage your library, customize your instance, and join the network.</p>
                        <div className="card-actions justify-end mt-4">
                            <button className="btn btn-outline">Read Docs</button>
                        </div>
                    </div>
                </div>

                <div className="card bg-base-200 border border-white/5">
                    <div className="card-body">
                        <h2 className="card-title"><Github/> Community</h2>
                        <p className="opacity-70">Report bugs, request features, or contribute to the codebase on GitHub.</p>
                        <div className="card-actions justify-end mt-4">
                            <a href="https://github.com/tunecamp/tunecamp" target="_blank" rel="noopener noreferrer" className="btn btn-outline">Visit GitHub</a>
                        </div>
                    </div>
                </div>
            </div>

            <div className="card bg-gradient-to-br from-primary/10 to-secondary/10 border border-white/5">
                <div className="card-body items-center text-center">
                    <Mail size={48} className="mb-4 text-primary"/>
                    <h2 className="card-title text-2xl">Need Help?</h2>
                    <p className="opacity-70 max-w-lg">
                        If you are experiencing issues with your instance, please check the server logs first. 
                        For critical support, contact the system administrator.
                    </p>
                </div>
            </div>
        </div>
    );
};
