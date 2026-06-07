import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import API from "../../services/api";
import type { SiteSettings } from "../../types";
import { Sidebar } from "./Sidebar";
import { PlayerBar } from "../player/PlayerBar";
import { PlayerCanvas } from "../player/PlayerCanvas";
import { AuthModal } from "../modals/AuthModal";
import { PlaylistModal } from "../modals/PlaylistModal";
import { UnlockModal } from "../modals/UnlockModal";
import { ArtistKeysModal } from "../modals/ArtistKeysModal";
import { AdminTrackModal } from "../modals/AdminTrackModal";
import { AdminArtistModal } from "../modals/AdminArtistModal";
import { CheckoutModal } from "../modals/CheckoutModal";
import { CommandPalette } from "../modals/CommandPalette";
import { usePlayerStore } from "../../stores/usePlayerStore";
import { useUIStore } from "../../stores/useUIStore";

export const MainLayout = () => {
  const [siteName, setSiteName] = useState("TuneCamp");
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null);
  const dominantColor = usePlayerStore(state => state.dominantColor);
  const theme = useUIStore(state => state.theme);

  useEffect(() => {
    // Apply theme on mount and when it changes
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    API.getSiteSettings()
      .then((s: SiteSettings) => {
        setSiteSettings(s);
        if (s.siteName) setSiteName(s.siteName);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!siteSettings) return;

    // Dynamic Font Loading from Google Fonts
    const font = siteSettings.themeFont || "Outfit";
    if (font !== "Outfit" && font !== "sans-serif") {
      const fontId = "dynamic-google-font";
      let linkElement = document.getElementById(fontId) as HTMLLinkElement;
      if (!linkElement) {
        linkElement = document.createElement("link");
        linkElement.id = fontId;
        linkElement.rel = "stylesheet";
        document.head.appendChild(linkElement);
      }
      const fontQuery = font.replace(/\s+/g, "+");
      linkElement.href = `https://fonts.googleapis.com/css2?family=${fontQuery}:wght@100..900&display=swap`;
    }

    // Dynamic CSS Custom Properties
    document.documentElement.style.setProperty("--font-sans", `"${font}", sans-serif`);
    
    if (siteSettings.themeBlur) {
      document.documentElement.style.setProperty("--custom-bg-blur", siteSettings.themeBlur);
    } else {
      document.documentElement.style.removeProperty("--custom-bg-blur");
    }
    
    if (siteSettings.themeOverlayOpacity) {
      const percent = Number(siteSettings.themeOverlayOpacity) * 100;
      document.documentElement.style.setProperty("--custom-bg-opacity", `${percent}%`);
    } else {
      document.documentElement.style.removeProperty("--custom-bg-opacity");
    }
  }, [siteSettings]);

  const hasBgImage = !!siteSettings?.backgroundImage;
  const bgImageStyle = hasBgImage ? {
    backgroundImage: `url(${siteSettings.backgroundImage})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundAttachment: 'fixed',
    backgroundRepeat: 'no-repeat',
  } : undefined;

  return (
    <div 
      className={`drawer lg:drawer-open h-screen text-base-content font-sans overflow-hidden ${hasBgImage ? "has-custom-bg" : "bg-base-100"}`}
      style={bgImageStyle}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] btn btn-primary btn-sm"
      >
        Skip to content
      </a>
      <input id="main-drawer" type="checkbox" className="drawer-toggle" />

      <div className="drawer-content relative flex flex-col h-full overflow-hidden bg-base-100">
        {/* Dominant Color Glow - subtle and minimalist */}
        <div 
          className="absolute top-0 right-0 w-1/2 h-1/2 bg-primary/5 blur-[120px] pointer-events-none z-0"
          style={{ 
            backgroundColor: dominantColor ? `${dominantColor}10` : 'transparent',
          }} 
        />

        {/* Mobile Header */}
        <div className="navbar lg:hidden bg-base-100/80 backdrop-blur-md border-b border-base-content/5 shadow-level-1 min-h-16 z-20">
          <div className="flex-none">
            <label
              htmlFor="main-drawer"
              aria-label="Open sidebar"
              className="btn btn-square btn-ghost"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                className="inline-block w-6 h-6 stroke-current"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 6h16M4 12h16M4 18h16"
                ></path>
              </svg>
            </label>
          </div>
          <div className="flex-1">
            <a className="btn btn-ghost text-xl font-bold tracking-tight">{siteName}</a>
          </div>
        </div>

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 relative flex flex-col h-full overflow-hidden focus:outline-none z-10"
        >
          <div className="flex-1 overflow-y-auto pb-48 scrollbar-thin p-4 lg:p-8">
            <div className="max-w-7xl mx-auto w-full">
              <Outlet />
            </div>
          </div>
        </main>
      </div>

      <div className="drawer-side z-50">
        <label
          htmlFor="main-drawer"
          aria-label="close sidebar"
          className="drawer-overlay"
        ></label>
        <Sidebar />
      </div>

      <PlayerBar />
      <PlayerCanvas />

      {/* Global Modals */}
      <CommandPalette />
      <AuthModal />
      <PlaylistModal />
      <UnlockModal />
      <ArtistKeysModal />
      <CheckoutModal />
      <AdminTrackModal
        onTrackUpdated={() =>
          window.dispatchEvent(new CustomEvent("refresh-admin-tracks"))
        }
      />
      <AdminArtistModal
        onArtistUpdated={() => {
          window.dispatchEvent(new CustomEvent("refresh-admin-artists"));
          window.dispatchEvent(new CustomEvent("refresh-admin-tracks"));
        }}
      />
    </div>
  );
};

