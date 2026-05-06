import { useState, useEffect } from "react";
import API from "../../services/api";
import { Save, CheckCircle2, Globe, Palette, Cog, Layout, Wallet, Shield, OctagonAlert, Activity } from "lucide-react";
import type { SiteSettings } from "../../types";
import { useWalletStore } from "../../stores/useWalletStore";
import { TuneCampFactory } from "shogun-contracts-sdk";

export const AdminSettingsPanel = () => {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const { wallet, externalWallet, useExternalWallet, isExternalConnected, isWalletReady } = useWalletStore();
  const { TuneCampCheckout } = (window as any).TuneCampSDK || {}; // Fallback if not directly importable or through sdk class
  const activeSigner = useExternalWallet ? externalWallet : wallet;
  const isReady = useExternalWallet ? isExternalConnected : isWalletReady;

  const [isCheckingOnChain, setIsCheckingOnChain] = useState(false);
  const [hasOnChainInstance, setHasOnChainInstance] = useState(false);

  const handleDeploy = async () => {
    if (!activeSigner || !isReady) {
      setMessage("Failed: Wallet not connected or not ready.");
      return;
    }
    setLoading(true);
    setMessage("Deploying Web3 Store... Please confirm transaction in your wallet.");

    try {
      // Find factory address for Base mainnet (chainId: 8453)
      const network = await activeSigner.provider!.getNetwork();
      const chainId = Number(network.chainId);

      const factory = new TuneCampFactory(activeSigner.provider as any, activeSigner as any, chainId);
      const instanceName = settings?.siteName || "TuneCamp";
      const baseURI = settings?.publicUrl ? `${settings.publicUrl}/api/nft/` : "https://tunecamp.app/api/nft/";

      // Treasury is the platform fee collector (could be actual TuneCamp platform wallet or admin for now)
      const adminAddress = await activeSigner.getAddress();
      const treasury = adminAddress; // Or specify a global platform wallet here

      const tx = await factory.deployInstance(instanceName, baseURI, treasury);
      setMessage("Transaction sent! Waiting for confirmation...");

      const receipt = await tx.wait();

      if (!receipt) throw new Error("Transaction failed or no receipt");

      let checkoutAddr = "";
      let nftAddr = "";

      for (const log of receipt.logs) {
        try {
          // @ts-ignore
          const parsed = factory.contract.interface.parseLog(log);
          if (parsed && parsed.name === "InstanceDeployed") {
            checkoutAddr = parsed.args.checkout;
            nftAddr = parsed.args.nft;
          }
        } catch (e) {
          // Ignore logs that can't be parsed by this interface
        }
      }

      if (checkoutAddr && nftAddr) {
        setSettings(prev => prev ? ({ ...prev, web3_checkout_address: checkoutAddr, web3_nft_address: nftAddr }) : null);
        setMessage("Store deployed successfully! Please click Save Changes.");
      } else {
        setMessage("Transaction confirmed! Please manually find the contract addresses from the transaction on BaseScan if they aren't shown, then save.");
      }

    } catch (e: any) {
      console.error(e);
      setMessage(`Deployment failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncTreasury = async () => {
    if (!activeSigner || !isReady || !settings?.web3_checkout_address || !settings?.adminTreasuryAddress) {
      setMessage("Failed: Wallet not connected or missing treasury configuration (Checkout address and Treasury address are required).");
      return;
    }
    setLoading(true);
    setMessage("Syncing treasury on-chain... Please confirm transaction in your wallet.");

    try {
      const network = await activeSigner.provider!.getNetwork();
      const chainId = Number(network.chainId);
      
      // Use SDK class if available, else standard ethers contract
      const checkout = new TuneCampCheckout(activeSigner.provider as any, activeSigner as any, chainId);
      checkout.attach(settings.web3_checkout_address);
      
      const tx = await checkout.setTreasury(settings.adminTreasuryAddress);
      setMessage("Transaction sent! Waiting for confirmation...");
      await tx.wait();
      setMessage("On-chain treasury address updated successfully!");
    } catch (e: any) {
      console.error(e);
      setMessage(`Failed to sync treasury: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    API.getAdminSettings().then(setSettings).catch(console.error);
  }, []);

  useEffect(() => {
    const checkFactory = async () => {
      if (!activeSigner || !isReady || !settings) return;

      try {
        setIsCheckingOnChain(true);
        const network = await activeSigner.provider!.getNetwork();
        const chainId = Number(network.chainId);

        // This will throw if the SDK doesn't support the chainId. We catch and ignore.
        const factory = new TuneCampFactory(activeSigner.provider as any, activeSigner as any, chainId);

        const address = await activeSigner.getAddress();
        const instances = await factory.instancesOf(address);

        if (instances && instances.length > 0) {
          setHasOnChainInstance(true);

          if (!settings.web3_checkout_address || !settings.web3_nft_address) {
            const firstInstanceId = instances[0];
            const instanceData = await factory.getInstance(firstInstanceId);
            setSettings(prev => prev ? ({
                ...prev,
                web3_checkout_address: instanceData.checkout,
                web3_nft_address: instanceData.nft
            }) : null);
            setMessage("Found existing on-chain store! Addresses have been auto-filled. Please save changes.");
          }
        } else {
          setHasOnChainInstance(false);
        }
      } catch (e) {
        // Will throw quietly if not connected to a supported chain or if factory not found
      } finally {
        setIsCheckingOnChain(false);
      }
    };

    checkFactory();
  }, [activeSigner, isReady, settings !== null]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setLoading(true);
    setMessage("");
    try {
      const settingsToSave = {
        ...settings,
        web3_checkout_address: settings.web3_checkout_address || "",
        web3_nft_address: settings.web3_nft_address || "",
      };
      await API.updateSettings(settingsToSave);

      if (bgFile) {
        await API.uploadBackgroundImage(bgFile);
      }
      if (coverFile) {
        await API.uploadSiteCover(coverFile);
      }

      setMessage("Settings saved successfully.");
      setBgFile(null);
      setCoverFile(null);
      // Refresh settings to get new bg url if needed
      API.getAdminSettings().then(setSettings);
    } catch (e) {
      console.error(e);
      setMessage("Failed to save settings.");
    } finally {
      setLoading(false);
    }
  };

  if (!settings)
    return (
      <div className="p-8 text-center opacity-50">Loading settings...</div>
    );

  const hasDeployedStore = !!(settings.web3_checkout_address && settings.web3_nft_address) || hasOnChainInstance;
  const checkoutAddress = settings.web3_checkout_address || "";
  const nftAddress = settings.web3_nft_address || "";

  return (
    <form onSubmit={handleSave} className="space-y-8 max-w-4xl">
      <div className="flex items-center justify-between border-b border-base-content/10 pb-4 mb-6">
        <div className="flex items-center gap-3">
          <Cog className="text-primary" size={24} />
          <h3 className="font-bold text-2xl">Site Settings</h3>
        </div>
        <button
          type="submit"
          className="btn btn-primary gap-2"
          disabled={loading}
        >
          <Save size={18} /> Save Changes
        </button>
      </div>

      {message && (
        <div className={`alert ${message.includes("Failed") ? "alert-error" : "alert-success"} shadow-lg rounded-xl mb-6`}>
          {message.includes("Failed") ? <OctagonAlert size={20} /> : <CheckCircle2 size={20} />}
          <span>{message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* General Settings */}
        <div className="bg-base-200/40 p-6 rounded-2xl border border-base-content/5 space-y-4">
          <div className="flex items-center gap-2 mb-2 text-primary/80">
            <Layout size={18} />
            <h4 className="font-bold uppercase text-xs tracking-wider">General Configuration</h4>
          </div>
          
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium text-sm">Site Name</span>
            </label>
            <input
              type="text"
              className="input input-bordered bg-base-300/50"
              value={settings.siteName}
              onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
              placeholder="My Music Label"
            />
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium text-sm">Site Description</span>
            </label>
            <textarea
              className="textarea textarea-bordered bg-base-300/50 h-28"
              value={settings.siteDescription || ""}
              onChange={(e) => setSettings({ ...settings, siteDescription: e.target.value })}
              placeholder="Describe your site for search engines and social sharing..."
            />
          </div>

          <div className="form-control pt-2 border-t border-base-content/5 mt-4">
            <label className="label cursor-pointer justify-between">
              <div className="flex items-center gap-2">
                <Shield size={16} className="opacity-60" />
                <span className="label-text font-medium">Public Registration</span>
              </div>
              <input
                type="checkbox"
                className="toggle toggle-primary toggle-sm"
                checked={settings.allowPublicRegistration || false}
                onChange={(e) =>
                  setSettings({ ...settings, allowPublicRegistration: e.target.checked })
                }
              />
            </label>
            <p className="text-[10px] opacity-40 px-1 mt-1">If enabled, anyone can create an account on your node.</p>
          </div>
        </div>

        {/* Federation Settings */}
        <div className="bg-base-200/40 p-6 rounded-2xl border border-base-content/5 space-y-4">
          <div className="flex items-center gap-2 mb-2 text-secondary/80">
            <Globe size={18} />
            <h4 className="font-bold uppercase text-xs tracking-wider">Federation & Network</h4>
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium text-sm">Public URL</span>
            </label>
            <input
              type="url"
              className="input input-bordered bg-base-300/50"
              value={settings.publicUrl || ""}
              onChange={(e) => setSettings({ ...settings, publicUrl: e.target.value })}
              placeholder="https://sudorecords.dev"
            />
            <label className="label">
              <span className="label-text-alt opacity-40">Required for ActivityPub and remote ZEN peers.</span>
            </label>
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium text-sm">ZEN Peers</span>
            </label>
            <textarea
              className="textarea textarea-bordered bg-base-300/50 h-28 font-mono text-xs"
              value={settings.gunPeers || ""}
              onChange={(e) => setSettings({ ...settings, gunPeers: e.target.value })}
              placeholder="https://peer1.com/gun, https://peer2.com/gun"
            />
            <label className="label">
              <span className="label-text-alt opacity-40 text-[10px]">Comma-separated list of relay nodes.</span>
            </label>
          </div>
        </div>

        {/* Branding Settings */}
        <div className="bg-base-200/40 p-6 rounded-2xl border border-base-content/5 space-y-4 md:col-span-2">
          <div className="flex items-center gap-2 mb-2 text-accent/80">
            <Palette size={18} />
            <h4 className="font-bold uppercase text-xs tracking-wider">Branding & Appearance</h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="form-control">
                <label className="label">
                  <span className="label-text font-medium text-sm">Background URL</span>
                </label>
                <input
                  type="text"
                  className="input input-bordered bg-base-300/50"
                  value={settings.backgroundImage || ""}
                  onChange={(e) => setSettings({ ...settings, backgroundImage: e.target.value })}
                  placeholder="/images/custom-bg.jpg"
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text font-medium text-sm">Upload New Background</span>
                </label>
                <input
                  type="file"
                  className="file-input file-input-bordered file-input-sm bg-base-300/50 w-full"
                  accept="image/*"
                  onChange={(e) => setBgFile(e.target.files ? e.target.files[0] : null)}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="form-control">
                <label className="label">
                  <span className="label-text font-medium text-sm">Node Cover Upload</span>
                </label>
                <input
                  type="file"
                  className="file-input file-input-bordered file-input-sm bg-base-300/50 w-full"
                  accept="image/*"
                  onChange={(e) => setCoverFile(e.target.files ? e.target.files[0] : null) }
                />
                <label className="label">
                  <span className="label-text-alt opacity-50 text-[10px]">This image represents your node in the global network list.</span>
                </label>
              </div>
              
              {settings.backgroundImage && (
                <div className="mt-2 text-xs flex items-center gap-2 opacity-60 bg-base-300/30 p-2 rounded-lg border border-base-content/5">
                  <div className="w-8 h-8 rounded bg-cover bg-center shrink-0 border border-base-content/10" style={{ backgroundImage: `url(${settings.backgroundImage})` }}></div>
                  <span className="truncate">Current Background: {settings.backgroundImage}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Web3 Settings */}
        <div className="bg-base-200/40 p-6 rounded-2xl border border-base-content/5 space-y-4 md:col-span-2">
          <div className="flex items-center gap-2 mb-2 text-yellow-400">
            <Wallet size={18} />
            <h4 className="font-bold uppercase text-xs tracking-wider">Web3 Store Configuration (Base Network)</h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium text-sm">Checkout Contract</span>
              </label>
              <input
                type="text"
                className="input input-bordered bg-base-300/50 font-mono text-xs"
                value={settings.web3_checkout_address !== undefined ? settings.web3_checkout_address : checkoutAddress}
                onChange={(e) => setSettings({ ...settings, web3_checkout_address: e.target.value })}
                placeholder="0x..."
              />
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium text-sm">NFT Contract</span>
              </label>
              <input
                type="text"
                className="input input-bordered bg-base-300/50 font-mono text-xs"
                value={settings.web3_nft_address !== undefined ? settings.web3_nft_address : nftAddress}
                onChange={(e) => setSettings({ ...settings, web3_nft_address: e.target.value })}
                placeholder="0x..."
              />
            </div>
          </div>

          <div className="pt-4 border-t border-base-content/5">
            {hasDeployedStore ? (
              <div className="bg-success/10 border border-success/30 p-4 rounded-xl flex items-center gap-3">
                <div className="p-2 bg-success/20 rounded-full text-success">
                  <CheckCircle2 size={16} />
                </div>
                <div>
                  <p className="text-success text-sm font-bold">Web3 Store Active</p>
                  <p className="text-[10px] opacity-70 text-success">NFT and Checkout contracts are correctly configured.</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col md:flex-row items-center gap-4">
                <div className="flex-1 opacity-60 text-xs">
                  <p>You haven't deployed your smart contracts yet. You can deploy them automatically on Base Network.</p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-md rounded-xl px-8"
                  onClick={handleDeploy}
                  disabled={loading || !isReady || isCheckingOnChain}
                >
                  {loading ? (
                    <span className="loading loading-spinner loading-xs"></span>
                  ) : isCheckingOnChain ? (
                    "Checking..."
                  ) : (
                    "Deploy Store Instance"
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
        
        {/* Revenue & Fees Settings */}
        <div className="bg-base-200/40 p-6 rounded-2xl border border-base-content/5 space-y-4 md:col-span-2">
          <div className="flex items-center gap-2 mb-2 text-green-400">
            <Save size={18} />
            <h4 className="font-bold uppercase text-xs tracking-wider">Revenue & Fees (Label Admin)</h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium text-sm">Label Admin Fee (%)</span>
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                className="input input-bordered bg-base-300/50"
                value={settings.adminFeePercentage || 0}
                onChange={(e) => setSettings({ ...settings, adminFeePercentage: e.target.value })}
                placeholder="0"
              />
              <label className="label">
                <span className="label-text-alt opacity-40 text-[10px]">Percentage fee taken from direct payments. For smart contracts, this is fixed at 15%.</span>
              </label>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium text-sm">Admin Treasury Wallet</span>
              </label>
              <input
                type="text"
                className="input input-bordered bg-base-300/50 font-mono text-xs"
                value={settings.adminTreasuryAddress || ""}
                onChange={(e) => setSettings({ ...settings, adminTreasuryAddress: e.target.value })}
                placeholder="0x..."
              />
              <label className="label">
                <span className="label-text-alt opacity-40 text-[10px]">Address where label fees are sent.</span>
              </label>
            </div>
          </div>
          
          <div className="pt-4 border-t border-base-content/5 flex flex-col md:flex-row items-center gap-4">
            <div className="flex-1 opacity-60 text-xs">
              <p>If you have a deployed Web3 Store, you must sync the treasury address to the blockchain to collect contract fees.</p>
            </div>
            <button
              type="button"
              className="btn btn-outline btn-success btn-sm rounded-xl px-6"
              onClick={handleSyncTreasury}
              disabled={loading || !isReady || !settings.web3_checkout_address}
            >
              Sync Treasury On-Chain
            </button>
          </div>
        </div>

        {/* Telegram Bot Settings */}
        <div className="bg-base-200/40 p-6 rounded-2xl border border-base-content/5 space-y-4 md:col-span-2">
          <div className="flex items-center gap-2 mb-2 text-blue-400">
            <Shield size={18} />
            <h4 className="font-bold uppercase text-xs tracking-wider">Telegram Music Ingester</h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium text-sm">Bot Token</span>
              </label>
              <input
                type="password"
                className="input input-bordered bg-base-300/50 font-mono text-xs"
                value={settings.telegram_bot_token || ""}
                onChange={(e) => setSettings({ ...settings, telegram_bot_token: e.target.value })}
                placeholder="123456789:ABCDefgh..."
              />
              <label className="label">
                <span className="label-text-alt opacity-40 text-[10px]">Get this from @BotFather on Telegram.</span>
              </label>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium text-sm">Allowed Channels / User IDs</span>
              </label>
              <input
                type="text"
                className="input input-bordered bg-base-300/50 font-mono text-xs"
                value={settings.telegram_allowed_channels || ""}
                onChange={(e) => setSettings({ ...settings, telegram_allowed_channels: e.target.value })}
                placeholder="-100..., 12345678"
              />
              <label className="label">
                <span className="label-text-alt opacity-40 text-[10px]">Comma-separated IDs allowed to push music. Leave empty to allow everyone (not recommended).</span>
              </label>
            </div>
          </div>
          
          <div className="bg-blue-500/5 border border-blue-500/20 p-4 rounded-xl text-xs opacity-70">
            <p>Once configured, you can send MP3/FLAC files or documents to your bot, and they will be automatically added to your Tunecamp library.</p>
          </div>
        </div>

        {/* Soulseek Configuration */}
        <div className="bg-base-200/40 p-6 rounded-2xl border border-base-content/5 space-y-4 md:col-span-2">
          <div className="flex items-center gap-2 mb-2 text-primary">
            <Activity size={18} />
            <h4 className="font-bold uppercase text-xs tracking-wider">Soulseek Configuration</h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium text-sm">Soulseek Username</span>
              </label>
              <input
                type="text"
                className="input input-bordered bg-base-300/50 font-mono text-xs"
                value={settings.soulseek_username || ""}
                onChange={(e) => setSettings({ ...settings, soulseek_username: e.target.value })}
                placeholder="username"
              />
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium text-sm">Soulseek Password</span>
              </label>
              <input
                type="password"
                className="input input-bordered bg-base-300/50 font-mono text-xs"
                value={settings.soulseek_password || ""}
                onChange={(e) => setSettings({ ...settings, soulseek_password: e.target.value })}
                placeholder="password"
              />
            </div>
          </div>
          
          <div className="bg-primary/5 border border-primary/20 p-4 rounded-xl text-xs opacity-70">
            <p>These credentials allow the server to connect to the Soulseek network for music discovery. Configuration is global for this server instance.</p>
          </div>
        </div>

        {/* OpenRouter AI Configuration */}
        <div className="bg-base-200/40 p-6 rounded-2xl border border-base-content/5 space-y-4 md:col-span-2">
          <div className="flex items-center gap-2 mb-2 text-secondary">
            <Activity size={18} />
            <h4 className="font-bold uppercase text-xs tracking-wider">AI Integration (OpenRouter)</h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium text-sm">OpenRouter API Key</span>
              </label>
              <input
                type="password"
                className="input input-bordered bg-base-300/50 font-mono text-xs"
                value={settings.openrouter_api_key || ""}
                onChange={(e) => setSettings({ ...settings, openrouter_api_key: e.target.value })}
                placeholder="sk-or-v1-..."
              />
              <label className="label">
                <span className="label-text-alt opacity-40 text-[10px]">Your API key from openrouter.ai</span>
              </label>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-medium text-sm">AI Model</span>
              </label>
              <input
                type="text"
                className="input input-bordered bg-base-300/50 font-mono text-xs"
                value={settings.openrouter_model || ""}
                onChange={(e) => setSettings({ ...settings, openrouter_model: e.target.value })}
                placeholder="openai/gpt-4o-mini"
              />
              <label className="label">
                <span className="label-text-alt opacity-40 text-[10px]">The model ID to use for metadata and recommendations.</span>
              </label>
            </div>
          </div>
          
          <div className="bg-secondary/5 border border-secondary/20 p-4 rounded-xl text-xs opacity-70">
            <p>Integrating OpenRouter allows TuneCamp to use Large Language Models for automated metadata enrichment and smart track recommendations. You can find model IDs at <a href="https://openrouter.ai/models" target="_blank" rel="noreferrer" className="link link-primary">openrouter.ai/models</a>.</p>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-6">
        <button
          type="submit"
          className="btn btn-primary btn-lg rounded-xl px-12 gap-3"
          disabled={loading}
        >
          {loading ? <span className="loading loading-spinner loading-md"></span> : <Save size={20} />}
          Save All Settings
        </button>
      </div>
    </form>
  );
};

