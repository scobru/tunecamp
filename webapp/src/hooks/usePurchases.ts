import { useState, useCallback, useEffect, useMemo } from "react";
import API from "../services/api";
import { useAuthStore } from "../stores/useAuthStore";

export function usePurchases() {
    const [serverPurchases, setServerPurchases] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const { isAuthenticated } = useAuthStore();

    useEffect(() => {
        if (!isAuthenticated) { setLoading(false); return; }
        API.getPurchases()
            .then(data => setServerPurchases(data.purchases || []))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [isAuthenticated]);

    const serverTrackIds = useMemo(
        () => new Set(serverPurchases.filter(p => p.track_id).map(p => String(p.track_id))),
        [serverPurchases]
    );

    const isPurchased = useCallback(
        (trackId: string | number): boolean => serverTrackIds.has(String(trackId)),
        [serverTrackIds]
    );

    const getCode = useCallback(
        (trackId: string | number): string | undefined =>
            serverPurchases.find(p => String(p.track_id) === String(trackId))?.code,
        [serverPurchases]
    );

    const verifyAndGetCode = useCallback(async (trackId: string | number): Promise<string | undefined> => {
        const id = String(trackId);
        const serverPurchase = serverPurchases.find(p => String(p.track_id) === id);
        return serverPurchase?.code;
    }, [serverPurchases]);

    return { serverPurchases, loading, isPurchased, getCode, verifyAndGetCode };
}
