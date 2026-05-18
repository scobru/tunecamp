import { Heart, Github, Coffee } from 'lucide-react';

const Support = () => {
    return (
        <div className="p-4 lg:p-8 animate-fade-in max-w-2xl mx-auto">
            <div className="text-center mb-12">
                <h1 className="text-4xl font-bold mb-4 flex items-center justify-center gap-3">
                    <Heart className="text-primary fill-primary/20" size={40} /> Support TuneCamp
                </h1>
                <p className="text-xl opacity-60">Help us keep the platform growing.</p>
            </div>

            <div className="space-y-8">
                {/* TuneCamp Support */}
                <div className="card bg-base-200 border border-base-content/5 shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1">
                    <div className="card-body items-center text-center">
                        <div className="w-16 h-16 rounded-full bg-secondary/10 flex items-center justify-center mb-4 text-secondary">
                            <Coffee size={32} />
                        </div>
                        <h2 className="card-title text-2xl mb-2">Empowering Artists</h2>
                        <p className="opacity-70 mb-8 max-w-sm">
                            TuneCamp is an open-source project empowering independent musicians. Support the development.
                        </p>
                        
                        <div className="w-full space-y-3">
                             <a 
                                href="https://buymeacoffee.com/scobru" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="btn btn-outline btn-secondary btn-block gap-3 text-lg h-14"
                             >
                                <Coffee size={20} /> Buy us a coffee
                             </a>
                             <a 
                                href="https://github.com/scobru/tunecamp" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="btn btn-outline btn-block gap-3 text-lg h-14"
                             >
                                <Github size={20} /> GitHub Sponsors
                             </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Support;

