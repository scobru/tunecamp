import { LifeBuoy, Github, Coffee } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';

const Support = () => {
    return (
        <div className="space-y-8 animate-fade-in">
            <PageHeader 
                title="Support" 
                subtitle="Help us keep the platform growing"
                icon={LifeBuoy}
                iconColor="text-primary"
            />

            <div className="max-w-2xl mx-auto space-y-8 mt-8">
                {/* TuneCamp Support */}
                <div className="card bg-base-200 border border-base-content/5 shadow-level-1 hover:shadow-level-1 transition-all hover:-translate-y-1">
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

