import express, { Router } from "express";
import { ethers } from "ethers";
import fs from "fs-extra";
import path from "path";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import Stripe from "stripe";
import type { DatabaseService } from "../../core/database.js";
import { getEthUsdRate } from "../../modules/catalog/price.js";
import type { ServerConfig } from "../../core/config.js";

// Setup Base RPC
const provider = new ethers.JsonRpcProvider(process.env.TUNECAMP_RPC_URL || "https://mainnet.base.org");

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const ERC20_ABI = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function decimals() view returns (uint8)",
    "event Transfer(address indexed from, address indexed to, uint256 value)"
];

const CHECKOUT_ABI = [
    "function purchaseWithETH(uint256 trackId, uint8 role, uint256 quantity) payable",
    "function purchaseWithUSDC(uint256 trackId, uint8 role, uint256 quantity)"
];

export function createPaymentsRoutes(database: DatabaseService, musicDir: string, config: ServerConfig): Router {
    const router = Router();

    // 1. Stripe Webhook (needs raw body, NO JSON PARSER)
    // This route MUST be mounted before the global express.json() in server.ts
    router.post("/stripe/webhook", express.raw({ type: 'application/json' }), async (req, res) => {
        const sKey = database.getSetting("stripe_secret_key") || config.stripeSecretKey;
        const wSecret = database.getSetting("stripe_webhook_secret") || config.stripeWebhookSecret;

        if (!sKey || !wSecret) {
            return res.status(501).json({ error: "Stripe not configured" });
        }
        const stripe = new Stripe(sKey);
        const sig = req.headers['stripe-signature'] as string;
        let event;

        try {
            event = stripe.webhooks.constructEvent(req.body, sig, wSecret);
        } catch (err: any) {
            console.error(`Webhook signature verification failed: ${err.message}`);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        if (event.type === 'checkout.session.completed') {
            const session = event.data.object as any;
            const metadata = session.metadata;
            if (metadata && metadata.itemId && metadata.type) {
                const itemId = parseInt(metadata.itemId, 10);
                const itemType = metadata.type; // 'track' or 'album'
                
                // Generate unlock code
                const code = Math.random().toString(36).substring(2, 12).toUpperCase();
                let releaseId: number | undefined;
                let trackId: number | undefined;
                
                if (itemType === 'track') {
                    // Prefer albumId from metadata if present
                    if (metadata.albumId) {
                        releaseId = parseInt(metadata.albumId, 10);
                    } else {
                        const track = database.getTrack(itemId);
                        releaseId = track?.album_id || undefined;
                    }
                    trackId = itemId;
                } else {
                    releaseId = itemId;
                }
                
                if (releaseId || trackId) {
                    database.createUnlockCode(code, releaseId, trackId);
                    console.log(`✅ Stripe Payment Success: Generated code ${code} for ${itemType} ${itemId}`);
                    // Note: In a production app, we would also email this code to session.customer_details.email
                }
            }
        }

        res.json({ received: true });
    });

    // All other routes below need JSON parsing
    router.use(express.json());

    /**
     * POST /api/payments/onramp-session
     * Create a Stripe Crypto Onramp session.
     */
    router.post("/onramp-session", async (req, res) => {
        try {
            const { address } = req.body;

            const sKey = database.getSetting("stripe_onramp_secret_key") || config.stripeOnrampSecretKey;

            if (!sKey) {
                return res.status(501).json({ 
                    error: "Stripe Onramp is not configured on this server.",
                    configured: false 
                });
            }

            if (!address) {
                return res.status(400).json({ error: "Destination address is required" });
            }

            const stripe = new Stripe(sKey);
            
            // Create a Crypto Onramp Session
            // Note: Stripe requires specific parameters for onramp sessions
            const onrampSession = await (stripe as any).crypto.onrampSessions.create({
                transaction_details: {
                    destination_currencies: ["usdc"],
                    destination_networks: ["base"],
                    wallet_addresses: {
                        base: address
                    }
                },
                customer_ip_address: req.ip || "0.0.0.0"
            });

            res.json({ 
                client_secret: onrampSession.client_secret,
                id: onrampSession.id
            });

        } catch (error: any) {
            console.error("Stripe Onramp session error:", error);
            res.status(500).json({ error: error.message || "Failed to create Stripe Onramp session" });
        }
    });

    /**
     * GET /api/payments/onramp-config
     * Check if Onramp is configured and which provider to use.
     */
    router.get("/onramp-config", (req, res) => {
        const hasStripeOnramp = !!(database.getSetting("stripe_onramp_secret_key") || config.stripeOnrampSecretKey);
        const hasStripeCheckout = !!(database.getSetting("stripe_secret_key") || config.stripeSecretKey);
        const hasMoonpay = !!(database.getSetting("moonpay_api_key") || config.moonpayApiKey);
        
        res.json({
            configured: hasStripeOnramp || hasMoonpay,
            stripeCheckout: hasStripeCheckout,
            provider: database.getSetting("onramp_provider") || (hasStripeOnramp ? "stripe" : (hasMoonpay ? "moonpay" : "none")),
            moonpayApiKey: database.getSetting("moonpay_api_key") || config.moonpayApiKey,
            stripePublishableKey: database.getSetting("stripe_publishable_key") || process.env.STRIPE_PUBLISHABLE_KEY
        });
    });

    /**
     * POST /api/payments/stripe/create-session
     */
    router.post("/stripe/create-session", async (req, res) => {
        try {
            const { itemId, type, successUrl, cancelUrl, email, albumId } = req.body;
            console.log(`[Stripe] Creating session for ${type} ${itemId} (Album: ${albumId || 'None'})`);

            if (!itemId || !type || !successUrl || !cancelUrl) {
                return res.status(400).json({ error: "Missing required fields: itemId, type, successUrl, and cancelUrl are required." });
            }

            const sKey = database.getSetting("stripe_secret_key") || config.stripeSecretKey;
            if (!sKey) {
                return res.status(501).json({ error: "Stripe not configured on this server." });
            }

            const stripe = new Stripe(sKey);

            let name = "";
            let amount = 0;
            if (type === 'track') {
                const trackId = parseInt(itemId, 10);
                let trackData: any = database.getTrack(trackId);

                // If albumId is provided, try to get price from release_tracks first
                if (albumId) {
                    const releaseTrack = database.getTrackPriceFromRelease(parseInt(albumId, 10), trackId);
                    if (releaseTrack) {
                        console.log(`[Stripe Debug] Using price from release_tracks for track ${trackId} in album ${albumId}`);
                        trackData = {
                            ...trackData,
                            price: releaseTrack.price,
                            price_usdc: releaseTrack.price_usdc,
                            currency: releaseTrack.currency,
                            title: releaseTrack.title || trackData?.title
                        };
                    }
                }

                console.log(`[Stripe Debug] Track resolved:`, trackData ? { id: itemId, title: trackData.title, price: trackData.price, price_usdc: trackData.price_usdc, currency: trackData.currency } : 'NULL');

                if (!trackData) return res.status(404).json({ error: `Track ${itemId} not found` });
                name = trackData.title;

                // Pricing Logic: Prefer stablecoin fields based on currency
                if (trackData.currency === 'USDC' || trackData.currency === 'USD') {
                    amount = Number(trackData.price_usdc || trackData.price || 0);
                } else if (trackData.currency === 'USDT') {
                    amount = Number(trackData.price_usdt || trackData.price || 0);
                } else {
                    amount = Number(trackData.price || 0);
                    if (trackData.currency === 'ETH' || !trackData.currency) {
                        const rate = await getEthUsdRate();
                        amount = amount * rate;
                    }
                }
            } else {
                const album = database.getAlbum(parseInt(itemId, 10));                console.log(`[Stripe Debug] Album found for ID ${itemId}:`, album ? { id: album.id, title: album.title, price: album.price, price_usdc: album.price_usdc, price_usdt: album.price_usdt, currency: album.currency } : 'NULL');
                if (!album) return res.status(404).json({ error: `Album ${itemId} not found` });
                name = album.title;
                
                if (album.currency === 'USDC' || album.currency === 'USD') {
                    amount = Number(album.price_usdc || album.price || 0);
                } else if (album.currency === 'USDT') {
                    amount = Number(album.price_usdt || album.price || 0);
                } else {
                    amount = Number(album.price || 0);
                    if (album.currency === 'ETH' || !album.currency) {
                        const rate = await getEthUsdRate();
                        amount = amount * rate;
                    }
                }
            }

            console.log(`[Stripe Debug] Final Item: ${name}, Calculated Amount: ${amount}`);

            if (amount <= 0) {
                // If price is 0, Stripe won't allow a checkout session.
                // We should handle this as a free download or error out.
                return res.status(400).json({ error: "Item price must be greater than zero for card payments. This item might be free or price is not set." });
            }

            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [{
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: name,
                        },
                        unit_amount: Math.round(amount * 100), // Stripe uses cents
                    },
                    quantity: 1,
                }],
                mode: 'payment',
                success_url: successUrl,
                cancel_url: cancelUrl,
                customer_email: email,
                metadata: {
                    itemId: itemId.toString(),
                    type: type,
                    albumId: albumId ? albumId.toString() : ""
                }
            });

            res.json({ id: session.id, url: session.url });
        } catch (error: any) {
            console.error("Stripe session error:", error);
            res.status(500).json({ error: error.message });
        }
    });



    /**
     * POST /api/payments/verify
     * Verify a transaction hash locally on the server to unlock a track.
     * Auto-detects payment type: Direct ETH, Direct ERC20 (USDC/USDT), or Checkout Contract.
     */
    router.post("/verify", async (req, res) => {
        try {
            const { txHash, feeTxHash, trackId } = req.body;

            if (!txHash || !trackId) {
                return res.status(400).json({ error: "Missing required fields" });
            }

            // --- REPLAY ATTACK PROTECTION ---
            const existingCode = database.getUnlockCodeByTxHash(txHash);
            if (existingCode) {
                console.warn(`[Verify] Replay attempt detected for txHash: ${txHash}`);
                return res.status(400).json({ error: "This transaction hash has already been used to unlock content." });
            }
            // --------------------------------

            // 1. Fetch transaction and receipt
            const [tx, receipt] = await Promise.all([
                provider.getTransaction(txHash),
                provider.getTransactionReceipt(txHash)
            ]);

            if (!tx || !receipt) {
                return res.status(404).json({ error: "Transaction not found on chain" });
            }

            if (receipt.status !== 1) {
                return res.status(400).json({ error: "Transaction failed on chain" });
            }

            // 2. Fetch track metadata
            const track = database.getTrack(parseInt(trackId, 10));
            if (!track) {
                return res.status(404).json({ error: "Track not found" });
            }

            const web3CheckoutAddr = database.getSetting("web3_checkout_address");
            const artistWallet = (track as any).walletAddress || process.env.TUNECAMP_OWNER_ADDRESS;
            const adminFeePct = Number(database.getSetting("adminFeePercentage") || 0);
            const adminTreasury = database.getSetting("adminTreasuryAddress");

            let verificationResult = { success: false, method: "", error: "" };

            // 3. IDENTIFY AND VERIFY PAYMENT TYPE
            const toAddress = tx.to?.toLowerCase();

            // Verify Label Fee for Direct Payments if split is enabled
            const isDirectPayment = !web3CheckoutAddr || toAddress !== web3CheckoutAddr.toLowerCase();
            if (isDirectPayment && adminFeePct > 0 && adminTreasury) {
                if (!feeTxHash) {
                    console.warn(`[Verify] Missing feeTxHash for split payment to artist ${artistWallet}`);
                    return res.status(400).json({ error: "Label fee transaction hash is required for split payments." });
                }
                const [feeTx, feeReceipt] = await Promise.all([
                    provider.getTransaction(feeTxHash),
                    provider.getTransactionReceipt(feeTxHash)
                ]);
                if (!feeTx || !feeReceipt || feeReceipt.status !== 1) {
                    return res.status(400).json({ error: "Label fee transaction not found or failed on chain." });
                }
                if (feeTx.to?.toLowerCase() !== adminTreasury.toLowerCase()) {
                    return res.status(400).json({ error: "Label fee transaction recipient mismatch." });
                }
                // Optional: verify amount matches expected percentage
                console.log(`[Verify] Label fee transaction ${feeTxHash} verified for treasury ${adminTreasury}`);
            }

            // Case A: Checkout Contract Call
            if (web3CheckoutAddr && toAddress === web3CheckoutAddr.toLowerCase()) {
                verificationResult.method = "CheckoutContract";
                try {
                    const iface = new ethers.Interface(CHECKOUT_ABI);
                    const parsed = iface.parseTransaction({ data: tx.data, value: tx.value });
                    
                    if (parsed) {
                        const paidTrackId = parsed.args[0].toString();
                        if (paidTrackId !== trackId.toString()) {
                            verificationResult.error = `Transaction paid for track ${paidTrackId}, but expected ${trackId}`;
                        } else {
                            // Amount check for ETH
                            if (parsed.name === "purchaseWithETH") {
                                const paidEth = parseFloat(ethers.formatEther(tx.value));
                                let expectedEth = track.price || 0;
                                if (track.currency === 'USD') {
                                    const rate = await getEthUsdRate();
                                    expectedEth = (track.price || 0) / rate;
                                }
                                const margin = expectedEth * 0.05;
                                if (paidEth < expectedEth - margin) {
                                    verificationResult.error = `Underpayment: paid ${paidEth} ETH, expected ~${expectedEth} ETH`;
                                } else {
                                    verificationResult.success = true;
                                }
                            } else if (parsed.name === "purchaseWithUSDC") {
                                // Contract looks up price from its own mapping, we just trust the trackId match if it succeeded
                                verificationResult.success = true;
                            }
                        }
                    } else {
                        verificationResult.error = "Could not parse Checkout contract transaction data";
                    }
                } catch (e) {
                    verificationResult.error = "Error decoding Checkout transaction: " + (e as Error).message;
                }
            } 
            // Case B: Direct ERC20 Transfer (USDC)
            else if (toAddress === USDC_ADDRESS.toLowerCase()) {
                const tokenSymbol = "USDC";
                verificationResult.method = `Direct${tokenSymbol}`;
                
                try {
                    const iface = new ethers.Interface(ERC20_ABI);
                    const parsed = iface.parseTransaction({ data: tx.data });
                    
                    if (parsed && parsed.name === "transfer") {
                        const recipient = parsed.args[0].toLowerCase();
                        const amount = parsed.args[1];
                        const decimals = 6; // USDC on Base has 6 decimals
                        const paidAmount = parseFloat(ethers.formatUnits(amount, decimals));
                        
                        let expectedAmount = track.price_usdc || 0;
                        if (adminFeePct > 0 && adminTreasury) {
                            // If fee split is active, artist receives total - fee
                            expectedAmount = expectedAmount * (1 - adminFeePct / 100);
                        }

                        if (artistWallet && recipient !== artistWallet.toLowerCase()) {
                            verificationResult.error = `Recipient mismatch: sent to ${recipient}, expected ${artistWallet}`;
                        } else if (paidAmount < expectedAmount * 0.99) { // 1% tolerance
                            verificationResult.error = `Underpayment: paid ${paidAmount} ${tokenSymbol}, expected ${expectedAmount}`;
                        } else {
                            verificationResult.success = true;
                        }
                    } else {
                        verificationResult.error = `Not a valid ${tokenSymbol} transfer transaction`;
                    }
                } catch (e) {
                    verificationResult.error = `Error decoding ${tokenSymbol} transfer: ` + (e as Error).message;
                }
            }
            // Case C: Direct ETH Transfer
            else if (artistWallet && toAddress === artistWallet.toLowerCase()) {
                verificationResult.method = "DirectETH";
                const paidEth = parseFloat(ethers.formatEther(tx.value));
                let expectedEth = track.price || 0;
                
                if (track.currency === 'USD') {
                    const rate = await getEthUsdRate();
                    expectedEth = (track.price || 0) / rate;
                }
                
                if (adminFeePct > 0 && adminTreasury) {
                    // If fee split is active, artist receives total - fee
                    expectedEth = expectedEth * (1 - adminFeePct / 100);
                }
                
                const margin = expectedEth * 0.05;
                if (paidEth < expectedEth - margin) {
                    verificationResult.error = `Underpayment: paid ${paidEth} ETH, expected ~${expectedEth} ETH`;
                } else {
                    verificationResult.success = true;
                }
            } else {
                verificationResult.error = `Transaction recipient ${tx.to} does not match checkout contract or artist wallet ${artistWallet}`;
            }

            if (!verificationResult.success) {
                console.warn(`Payment verification failed: ${verificationResult.error}`);
                return res.status(400).json({ error: verificationResult.error || "Verification failed" });
            }

            // 4. Success: Generate unlock code
            const code = Math.random().toString(36).substring(2, 12).toUpperCase();
            const tid = parseInt(trackId, 10);
            const albumId = track.album_id;
            
            // Check if this was an album purchase or track purchase
            database.createUnlockCode(code, albumId || undefined, tid, txHash);
                console.log(`✅ Verified ${verificationResult.method} payment for track ${trackId}. Code: ${code}`);

            return res.json({
                success: true,
                code,
                trackId: track.id,
                albumId: track.album_id,
                method: verificationResult.method,
                message: "Transaction verified successfully"
            });

        } catch (error) {
            console.error("Payment verification error:", error);
            res.status(500).json({ error: "Internal server error during verification" });
        }
    });

    /**
     * GET /api/payments/rate/:currency
     * Get the current conversion rate for a currency (only 'USD' supported for now).
     */
    router.get("/rate/:currency", async (req, res) => {
        try {
            const { currency } = req.params;
            if (currency.toUpperCase() !== 'USD') {
                return res.status(400).json({ error: "Unsupported currency" });
            }

            const rate = await getEthUsdRate();
            res.json({ rate });
        } catch (error) {
            console.error("Rate fetch error:", error);
            res.status(500).json({ error: "Failed to fetch rate" });
        }
    });

    /**
     * GET /api/payments/download/:trackId
     * Download a purchased track using an unlock code.
     * Query param: ?code=XXXXXXXXXX
     */
    router.get("/download/:trackId", async (req, res) => {
        try {
            const trackId = parseInt(req.params.trackId as string, 10);
            const code = req.query.code as string;

            if (!code) {
                return res.status(400).json({ error: "Unlock code required" });
            }

            // Validate unlock code
            const validation = database.validateUnlockCode(code);
            if (!validation.valid) {
                return res.status(403).json({ error: "Invalid or expired unlock code" });
            }

            // Get track
            const track = database.getTrack(trackId);
            if (!track) {
                return res.status(404).json({ error: "Track not found" });
            }

            // Verify code is for the correct album or track
            const matchesTrack = validation.trackId === trackId;
            const matchesAlbum = validation.releaseId && track.album_id && validation.releaseId === track.album_id;

            if (!matchesTrack && !matchesAlbum) {
                return res.status(403).json({ error: "Unlock code is not valid for this track or its album" });
            }

            if (!track.file_path) {
                return res.status(400).json({ error: "Track has no downloadable file" });
            }

            const trackPath = path.join(musicDir, track.file_path);
            if (!await fs.pathExists(trackPath)) {
                return res.status(404).json({ error: "Track file not found on disk" });
            }

            const filename = path.basename(trackPath);
            res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
            res.setHeader("Content-Type", "application/octet-stream");
            return fs.createReadStream(trackPath).pipe(res);

        } catch (error) {
            console.error("Payment download error:", error);
            res.status(500).json({ error: "Failed to download track" });
        }
    });

    return router;
}

