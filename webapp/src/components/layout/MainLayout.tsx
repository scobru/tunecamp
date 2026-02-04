import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import API from '../services/api';
import type { SiteSettings } from '../../types';
import { Sidebar } from './Sidebar';
import { PlayerBar } from '../player/PlayerBar';
import { AuthModal } from '../modals/AuthModal';
import { PlaylistModal } from '../modals/PlaylistModal';
import { UnlockModal } from '../modals/UnlockModal';
import { ArtistKeysModal } from '../modals/ArtistKeysModal';

export const MainLayout = () => {
    const [bgUrl, setBgUrl] = useState('');

    useEffect(() => {
        API.getSiteSettings().then((s: SiteSettings) => {
            if (s.backgroundImage) setBgUrl(s.backgroundImage);
        }).catch(console.error);
    }, []);

    return (
        <div className="flex h-screen bg-black text-white font-sans overflow-hidden relative">
            {/* Global Background */}
             {bgUrl && (
                 <div 
                     className="absolute inset-0 z-0 opacity-20 bg-cover bg-center pointer-events-none"
                     style={{ backgroundImage: `url(${bgUrl})` }}
                 />
             )}
            
            <div className="relative z-10 flex w-full h-full">
                <Sidebar />
                
                <main className="flex-1 bg-base-100/90 relative flex flex-col h-full lg:rounded-tl-2xl border-t border-l border-white/5 lg:mr-2 lg:mt-2 lg:mb-24 shadow-2xl overflow-hidden backdrop-blur-3xl">
                <div className="flex-1 overflow-y-auto pb-32 scroll-smooth p-6">
                    <Outlet />
                </div>
            </main>
            </div>

            <PlayerBar />
            
            {/* Global Modals */}
            <AuthModal />
            <PlaylistModal />
            <UnlockModal />
            <ArtistKeysModal />
        </div>
    );
};
