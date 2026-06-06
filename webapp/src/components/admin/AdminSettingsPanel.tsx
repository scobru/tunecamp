import { useState, useEffect } from "react";
import API from "../../services/api";
import { Save, CheckCircle2, Globe, Palette, Cog, Layout, Wallet, Shield, OctagonAlert, Eye, EyeOff, Copy } from "lucide-react";
import type { SiteSettings } from "../../types";
import { useWalletStore } from "../../stores/useWalletStore";
import { TuneCampFactory, TuneCampCheckout } from "shogun-contracts-sdk";

export const AdminSettingsPanel = () => {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const { signer, isConnected } = useWalletStore();
  const activeSigner = signer;
  const isReady = isConnected;

  const [isCheckingOnChain, setIsCheckingOnChain] = useState(false);
  const [hasOnChainInstance, setHasOnChainInstance] = useState(false);

  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopySecret = () => {
    if (!settings?.jwtSecret) return;
    navigator.clipboard.writeText(settings.jwtSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
      if (logoFile) {
        await API.uploadSiteLogo(logoFile);
      }

      setMessage("Settings saved successfully.");
      setBgFile(null);
      setCoverFile(null);
      setLogoFile(null);
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
                checked={settings.allowPublicRegistration === true || (settings.allowPublicRegistration as unknown) === "true"}
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
              value={settings.zenPeers || ""}
              onChange={(e) => setSettings({ ...settings, zenPeers: e.target.value })}
              placeholder="wss://peer1.com/zen, wss://peer2.com/zen"
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
                  onChange={(e) => {
                    const val = e.target.value;
                    setSettings({ ...settings, backgroundImage: val });
                    // Live preview background image
                    const mainDiv = document.querySelector(".drawer");
                    if (mainDiv) {
                      if (val) {
                        (mainDiv as HTMLElement).style.backgroundImage = `url(${val})`;
                        (mainDiv as HTMLElement).style.backgroundSize = 'cover';
                        (mainDiv as HTMLElement).style.backgroundPosition = 'center';
                        (mainDiv as HTMLElement).style.backgroundAttachment = 'fixed';
                        (mainDiv as HTMLElement).style.backgroundRepeat = 'no-repeat';
                        (mainDiv as HTMLElement).classList.add("has-custom-bg");
                      } else {
                        (mainDiv as HTMLElement).style.backgroundImage = '';
                        (mainDiv as HTMLElement).classList.remove("has-custom-bg");
                      }
                    }
                  }}
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
                  onChange={(e) => {
                    const file = e.target.files ? e.target.files[0] : null;
                    setBgFile(file);
                    if (file) {
                      const url = URL.createObjectURL(file);
                      const mainDiv = document.querySelector(".drawer");
                      if (mainDiv) {
                        (mainDiv as HTMLElement).style.backgroundImage = `url(${url})`;
                        (mainDiv as HTMLElement).style.backgroundSize = 'cover';
                        (mainDiv as HTMLElement).style.backgroundPosition = 'center';
                        (mainDiv as HTMLElement).style.backgroundAttachment = 'fixed';
                        (mainDiv as HTMLElement).style.backgroundRepeat = 'no-repeat';
                        (mainDiv as HTMLElement).classList.add("has-custom-bg");
                      }
                    }
                  }}
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text font-medium text-sm">Theme Font Family</span>
                </label>
                <select
                  className="select select-bordered bg-base-300/50 w-full"
                  value={settings.themeFont || "Outfit"}
                  onChange={(e) => {
                    const font = e.target.value;
                    setSettings({ ...settings, themeFont: font });
                    // Live dynamic font loading and application
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
                    document.documentElement.style.setProperty("--font-sans", `"${font}", sans-serif`);
                  }}
                >
                  <option value="Outfit">Outfit (Default)</option>
                  <option value="Inter">Inter (Geometric & Clean)</option>
                  <option value="Montserrat">Montserrat (Modern & Bold)</option>
                  <option value="Lora">Lora (Elegant & Classic Serif)</option>
                  <option value="Playfair Display">Playfair Display (Premium Serif)</option>
                  <option value="JetBrains Mono">JetBrains Mono (Tech & Minimal)</option>
                </select>
              </div>

              <div className="form-control">
                <div className="flex justify-between items-center mb-1">
                  <label className="label p-0">
                    <span className="label-text font-medium text-sm">Glass Overlay Opacity</span>
                  </label>
                  <span className="text-xs opacity-60 font-bold">{Math.round((Number(settings.themeOverlayOpacity) !== undefined ? Number(settings.themeOverlayOpacity) : 0.85) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.4"
                  max="0.95"
                  step="0.05"
                  className="range range-xs range-primary"
                  value={settings.themeOverlayOpacity !== undefined ? Number(settings.themeOverlayOpacity) : 0.85}
                  onChange={(e) => {
                    const opacity = Number(e.target.value);
                    setSettings({ ...settings, themeOverlayOpacity: opacity });
                    document.documentElement.style.setProperty("--custom-bg-opacity", `${opacity * 100}%`);
                  }}
                />
              </div>

              <div className="form-control">
                <div className="flex justify-between items-center mb-1">
                  <label className="label p-0">
                    <span className="label-text font-medium text-sm">Global Background Blur</span>
                  </label>
                  <span className="text-xs opacity-60 font-bold">{settings.themeBlur || "10px"}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="24"
                  step="4"
                  className="range range-xs range-primary"
                  value={parseInt(settings.themeBlur || "10px")}
                  onChange={(e) => {
                    const blurValue = `${e.target.value}px`;
                    setSettings({ ...settings, themeBlur: blurValue });
                    document.documentElement.style.setProperty("--custom-bg-blur", blurValue);
                  }}
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

              <div className="form-control">
                <label className="label">
                  <span className="label-text font-medium text-sm">Custom Logo Upload</span>
                </label>
                <input
                  type="file"
                  className="file-input file-input-bordered file-input-sm bg-base-300/50 w-full"
                  accept="image/*"
                  onChange={(e) => setLogoFile(e.target.files ? e.target.files[0] : null) }
                />
                <label className="label">
                  <span className="label-text-alt opacity-50 text-[10px]">This logo will appear in the top-left corner of the sidebar.</span>
                </label>
              </div>
              
              <div className="flex flex-col gap-2 mt-2">
                {settings.backgroundImage && (
                  <div className="text-xs flex items-center gap-2 opacity-60 bg-base-300/30 p-2 rounded-lg border border-base-content/5">
                    <div className="w-8 h-8 rounded bg-cover bg-center shrink-0 border border-base-content/10" style={{ backgroundImage: `url(${settings.backgroundImage})` }}></div>
                    <span className="truncate">Background: {settings.backgroundImage}</span>
                  </div>
                )}
                {settings.siteLogo && (
                  <div className="text-xs flex items-center gap-2 opacity-60 bg-base-300/30 p-2 rounded-lg border border-base-content/5">
                    <div className="w-8 h-8 rounded bg-contain bg-center bg-no-repeat shrink-0 border border-base-content/10" style={{ backgroundImage: `url(${settings.siteLogo})` }}></div>
                    <span className="truncate">Site Logo: {settings.siteLogo}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Web3 Settings */}
        <div className="bg-base-200/40 p-6 rounded-2xl border border-base-content/5 space-y-4 md:col-span-2">
          <div className="flex items-center gap-2 mb-2 text-yellow-400">
            <Wallet size={18} />
            <h4 className="font-bold uppercase text-xs tracking-wider">Web3 Store Configuration</h4>
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

        {/* Security & System Keys */}
        <div className="bg-base-200/40 p-6 rounded-2xl border border-base-content/5 space-y-4 md:col-span-2">
          <div className="flex items-center gap-2 mb-2 text-error/80">
            <Shield size={18} />
            <h4 className="font-bold uppercase text-xs tracking-wider">Security & System Keys (Root Admin)</h4>
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text font-medium text-sm">Server Master Key (JWT Secret)</span>
            </label>
            <div className="flex gap-2 items-center">
              <input
                type={showSecret ? "text" : "password"}
                readOnly
                className="input input-bordered bg-base-300/50 font-mono text-xs flex-1 cursor-default select-all"
                value={settings.jwtSecret || "Not configured or restricted"}
              />
              <button
                type="button"
                className="btn btn-square btn-outline btn-sm"
                onClick={() => setShowSecret(!showSecret)}
                title={showSecret ? "Hide secret" : "Reveal secret"}
              >
                {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <button
                type="button"
                className="btn btn-square btn-outline btn-sm"
                onClick={handleCopySecret}
                title="Copy to clipboard"
                disabled={!settings.jwtSecret}
              >
                {copied ? <CheckCircle2 size={16} className="text-success" /> : <Copy size={16} />}
              </button>
            </div>
            <label className="label">
              <span className="label-text-alt text-error/80 text-[10px] flex items-center gap-1 font-medium mt-1">
                <OctagonAlert size={12} />
                WARNING: This is the server's master cryptographic key. Keep it secret and secure. It is used to decrypt all Zen identities and derive user wallets.
              </span>
            </label>
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

