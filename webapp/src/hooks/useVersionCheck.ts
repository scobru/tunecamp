import { useEffect, useState, useRef } from "react";

const POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

async function fetchVersion(): Promise<string | null> {
    try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return null;
        const data = await res.json();
        return data.version ?? null;
    } catch {
        return null;
    }
}

export function useVersionCheck(): boolean {
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const initialVersion = useRef<string | null>(null);

    useEffect(() => {

        async function check() {
            const version = await fetchVersion();
            if (!version) return;
            if (initialVersion.current === null) {
                initialVersion.current = version;
                return;
            }
            if (version !== initialVersion.current) {
                setUpdateAvailable(true);
            }
        }

        check();
        const timer = setInterval(check, POLL_INTERVAL_MS);

        function onVisibilityChange() {
            if (document.visibilityState === "visible") check();
        }

        // Detect new service worker activation
        function onControllerChange() {
            if (initialVersion.current !== null) setUpdateAvailable(true);
        }

        document.addEventListener("visibilitychange", onVisibilityChange);
        navigator.serviceWorker?.addEventListener("controllerchange", onControllerChange);

        return () => {
            clearInterval(timer);
            document.removeEventListener("visibilitychange", onVisibilityChange);
            navigator.serviceWorker?.removeEventListener("controllerchange", onControllerChange);
        };
    }, []);

    return updateAvailable;
}
