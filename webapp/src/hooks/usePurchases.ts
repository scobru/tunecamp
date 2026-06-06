import { useState, useCallback } from "react";

export interface PurchaseRecord {
    txid: string;
    date: number;
    price: string;
    code?: string;
}

export function usePurchases() {
    const [purchases] = useState<Map<string, PurchaseRecord>>(new Map());
    const [loading] = useState(false);

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

        if (purchase?.code) return purchase.code;

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
    }, [purchases]);

    return { purchases, loading, isPurchased, getCode, getPurchase, verifyAndGetCode };
}
