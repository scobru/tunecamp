import { useState, useCallback, useEffect, useMemo } from "react";
import API from "../services/api";
import { useAuthStore } from "../stores/useAuthStore";

export interface PurchaseRecord {
    txid: string;
    date: number;
    price: string;
    code?: string;
}

export function usePurchases() {
    const [purchases] = useState<Map<string, PurchaseRecord>>(new Map());
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
        (trackId: string | number): boolean =>
            purchases.has(String(trackId)) || serverTrackIds.has(String(trackId)),
        [purchases, serverTrackIds]
    );

    const getCode = useCallback(
        (trackId: string | number): string | undefined =>
            purchases.get(String(trackId))?.code ||
            serverPurchases.find(p => String(p.track_id) === String(trackId))?.code,
        [purchases, serverPurchases]
    );

    const getPurchase = useCallback(
        (trackId: string | number): PurchaseRecord | undefined =>
            purchases.get(String(trackId)),
        [purchases]
    );

    const verifyAndGetCode = useCallback(async (trackId: string | number): Promise<string | undefined> => {
        const id = String(trackId);
        const purchase = purchases.get(id);
        if (purchase?.code) return purchase.code;

        const serverPurchase = serverPurchases.find(p => String(p.track_id) === id);
        if (serverPurchase?.code) return serverPurchase.code;

        if (purchase?.txid) {
            try {
                const res = await fetch("/api/payments/verify", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ txHash: purchase.txid, trackId: id })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.code) return data.code;
                }
            } catch (err) {
                console.error("Failed to re-verify purchase:", err);
            }
        }

        return undefined;
    }, [purchases, serverPurchases]);

    return { purchases, serverPurchases, loading, isPurchased, getCode, getPurchase, verifyAndGetCode };
}
