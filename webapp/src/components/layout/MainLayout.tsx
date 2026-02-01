import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { PlayerBar } from '../player/PlayerBar';

export const MainLayout = () => {
    return (
        <div className="flex h-screen bg-black text-white font-sans overflow-hidden">
            <Sidebar />
            
            <main className="flex-1 bg-base-100 relative flex flex-col h-full lg:rounded-tl-2xl border-t border-l border-white/5 lg:mr-2 lg:mt-2 lg:mb-24 shadow-2xl overflow-hidden">
                <div className="flex-1 overflow-y-auto pb-32 scroll-smooth p-6">
                    <Outlet />
                </div>
            </main>

            <PlayerBar />
        </div>
    );
};
