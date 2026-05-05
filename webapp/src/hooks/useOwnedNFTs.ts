import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { TokenRole, DEPLOYMENTS } from 'shogun-contracts-sdk';
import { WalletService } from '../services/wallet';
import API from '../services/api';
import type { Track } from '../types';

export interface OwnedNFT {
    trackId: number;
    title: string;
    artistName: string;
    coverUrl?: string;
    role: TokenRole;
    balance: number;
}

export function useOwnedNFTs(address: string | null) {
    const [ownedNFTs, setOwnedNFTs] = useState<OwnedNFT[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    
    // We also need track metadata
    const [tracks, setTracks] = useState<Record<number, Track>>({});

    useEffect(() => {
        // Fetch all tracks once to have metadata handy
        API.getTracks().then(data => {
            const trackMap: Record<number, Track> = {};
            data.forEach(t => trackMap[Number(t.id)] = t);
            setTracks(trackMap);
        }).catch(console.error);
    }, []);

    useEffect(() => {
        if (!address || Object.keys(tracks).length === 0) {
            setLoading(false);
            return;
        }

        let isMounted = true;

        const fetchBalances = async () => {
            setLoading(true);
            try {
                // Instantiate the TuneCampNFT contract wrapper
                const provider = WalletService.provider;
                if (!provider) {
                    console.error("No provider found in WalletService");
                    setLoading(false);
                    return;
                }
                
                // Currently returning chain 8453 (Base Mainnet) hardcoded for production or via config
                const chainId = await WalletService.getChainId();
                
                // Prioritize server-injected config for NFT address
                const configNftAddress = (window as any).TUNECAMP_CONFIG?.web3_nft_address;
                
                // Fallback to our sdk DEPLOYMENTS map
                const deploymentData = (DEPLOYMENTS as Record<string, any>)[String(chainId)]?.["TuneCampFactory#TuneCampNFT"];
                const nftAddress = configNftAddress || deploymentData?.address as string;
                const nftAbi = deploymentData?.abi;
                
                if (!nftAddress || !nftAbi) {
                    console.error("TuneCampNFT proxy address or ABI not found in ABI deployments for chain", chainId, "Deployment data:", deploymentData);
                    setLoading(false);
                    return;
                }

                console.log(`Fetching NFT balances for ${address} on chain ${chainId} at contract ${nftAddress}`);

                const tuneCampNFT = new ethers.Contract(nftAddress, nftAbi, provider);

                // Check all tracks in the catalog for ownership, not just those in the 'purchases' list
                // This allows NFTs bought directly on-chain to be visible.
                const allTrackIds = Object.keys(tracks).map(id => parseInt(id, 10)).filter(id => !isNaN(id));
                const nftsFound: OwnedNFT[] = [];

                const accounts: string[] = [];
                const tokenIds: bigint[] = [];
                const lookup: { trackId: number, role: TokenRole }[] = [];

                for (const trackId of allTrackIds) {
                    // Local computation instead of contract call (O(1) vs O(N) network calls)
                    // Formula: trackId * 10 + role (from TuneCampNFT.sol)
                    const idLicense = BigInt(trackId) * 10n + BigInt(TokenRole.LICENSE);
                    const idOwnership = BigInt(trackId) * 10n + BigInt(TokenRole.OWNERSHIP);
                    
                    accounts.push(address, address);
                    tokenIds.push(idLicense, idOwnership);
                    
                    lookup.push({ trackId, role: TokenRole.LICENSE });
                    lookup.push({ trackId, role: TokenRole.OWNERSHIP });
                }

                if (tokenIds.length > 0) {
                     // Since TuneCampNFT inherits ERC1155, it has balanceOfBatch
                     // Chunking the batch call to prevent RPC payload size limits on large catalogs
                     const CHUNK_SIZE = 500;
                     for (let i = 0; i < tokenIds.length; i += CHUNK_SIZE) {
                         const chunkAccounts = accounts.slice(i, i + CHUNK_SIZE);
                         const chunkTokenIds = tokenIds.slice(i, i + CHUNK_SIZE);
                         const chunkLookup = lookup.slice(i, i + CHUNK_SIZE);

                         const balances: bigint[] = await tuneCampNFT.balanceOfBatch(chunkAccounts, chunkTokenIds);

                         balances.forEach((bal, idx) => {
                             if (bal > 0n) {
                                 const trackData = tracks[chunkLookup[idx].trackId];
                                 nftsFound.push({
                                     trackId: chunkLookup[idx].trackId,
                                     title: trackData?.title || `Track #${chunkLookup[idx].trackId}`,
                                     artistName: trackData?.artistName || "Unknown Artist",
                                     coverUrl: trackData?.coverUrl || (trackData?.albumId ? API.getAlbumCoverUrl(trackData.albumId) : (chunkLookup[idx].trackId ? API.getTrackCoverUrl(chunkLookup[idx].trackId) : undefined)),
                                     role: chunkLookup[idx].role,
                                     balance: Number(bal)
                                 });
                             }
                         });
                     }
                }

                if (isMounted) {
                    console.log(`OwnedNFTs result for ${address}:`, nftsFound);
                    setOwnedNFTs(nftsFound);
                }
            } catch (err) {
                console.error("Failed to load owned NFTs:", err);
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        fetchBalances();

        return () => { isMounted = false; };
    }, [address, tracks]);

    return { ownedNFTs, loading };
}

