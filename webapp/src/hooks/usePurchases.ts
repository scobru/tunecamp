import { useState, useEffect, useCallback } from "react";
import { ZenAuth } from "../services/zen";

export interface PurchaseRecord {
    txid: string;
    date: number;
    price: string;
    code?: string;
}

/**
 * Hook to load and track the current GunDB user's purchases.
 * Returns a map of trackId -> PurchaseRecord and helper methods.
 */
export function usePurchases() {
    const [purchases, setPurchases] = useState<Map<string, PurchaseRecord>>(new Map());
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const user = ZenAuth.user;
        if (!user.is) {
            setLoading(false);
            return;
        }

        const entries = new Map<string, PurchaseRecord>();
        let settled = false;

        // Timeout so we don't stay in "loading" forever if no purchases exist
        const timeout = setTimeout(() => {
            if (!settled) {
                settled = true;
                setLoading(false);
            }
        }, 3000);

        // @ts-ignore — GunDB dynamic API
        user.get("purchases").map().on((data: any, trackId: string) => {
            if (!data || trackId === "_") return;

            // GunDB can return soul/metadata objects — skip them
            if (typeof data !== "object" || !data.txid) return;

            entries.set(String(trackId), {
                txid: data.txid,
                date: data.date,
                price: data.price,
                code: data.code || undefined,
            });

            setPurchases(new Map(entries));

            if (!settled) {
                settled = true;
                setLoading(false);
            }
        });

        return () => {
            clearTimeout(timeout);
            // GunDB `.off()` is not always reliable, but we try
            try {
                // @ts-ignore
                user.get("purchases").map().off();
            } catch {
                // ignore
            }
        };
    }, []);

    const isPurchased = useCallback(
        (trackId: string | number): boolean => purchases.has(String(trackId)),
        [purchases]
    );

    const getCode = useCallback(
        (trackId: string | number): string | undefined =>
            purchases.get(String(trackId))?.code,
        [purchases]
    );

    const getPurchase = useCallback(
        (trackId: string | number): PurchaseRecord | undefined =>
            purchases.get(String(trackId)),
        [purchases]
    );

    const verifyAndGetCode = useCallback(async (trackId: string | number): Promise<string | undefined> => {
        const id = String(trackId);
        const purchase = purchases.get(id);
        
        if (!purchase) return undefined;
        
        // If we already have the code locally, just return it
        if (purchase.code) return purchase.code;
        
        // If we have txid but no code, re-verify with backend to regenerate it
        if (purchase.txid) {
            try {
                const res = await fetch("/api/payments/verify", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        txHash: purchase.txid,
                        trackId: id
                    })
                });
                
                if (res.ok) {
                    const data = await res.json();
                    if (data.code) {
                        // Optionally update local zen node so next time it's there
                        const user = ZenAuth.user;
                        if (user.is) {
                            // @ts-ignore
                            user.get("purchases").get(id).put({ ...purchase, code: data.code });
                        }
                        
                        return data.code;
                    }
                }
            } catch (err) {
                console.error("Failed to re-verify purchase:", err);
            }
        }
        
        return undefined;
    }, [purchases]);

    return { purchases, loading, isPurchased, getCode, getPurchase, verifyAndGetCode };
}

