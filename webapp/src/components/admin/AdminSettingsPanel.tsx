import { useState, useEffect } from "react";
import API from "../../services/api";
import { Save, CheckCircle2, Palette, Cog, Layout, Wallet, Shield, OctagonAlert, Eye, EyeOff, Copy, Trash2, RotateCcw } from "lucide-react";
import type { SiteSettings } from "../../types";
import { useWalletStore } from "../../stores/useWalletStore";
import { TuneCampFactory, TuneCampCheckout } from "shogun-contracts-sdk";
import { applyThemeFont } from "../../utils/themeFont";

export const AdminSettingsPanel = () => {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [subTab, setSubTab] = useState<"general" | "features" | "branding" | "payments" | "security">("general");
  const [message, setMessage] = useState("");
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [imageCacheBust, setImageCacheBust] = useState(() => Date.now());
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
      setImageCacheBust(Date.now());
      // Refresh settings to get new bg url if needed
      API.getAdminSettings().then(setSettings);
    } catch (e: any) {
      console.error(e);
      // Surface the backend's reason (e.g. "File too large", "Unsupported image type")
      // instead of a generic failure so the user knows how to fix it.
      const reason = e?.message || "Unknown error";
      setMessage(`Failed to save settings: ${reason}`);
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
  const web3Enabled = settings.web3Enabled === true || (settings.web3Enabled as unknown) === "true";

  // Append a cache-bust param, picking the right separator since the stored
  // site-image URLs are now versioned (already contain "?v=...").
  const bust = (url: string) => `${url}${url.includes("?") ? "&" : "?"}t=${imageCacheBust}`;

  const categories = [
    { id: "general", label: "General Config", icon: Layout },
    { id: "features", label: "Customize Modules", icon: Cog },
    { id: "branding", label: "Branding & Theme", icon: Palette },
    { id: "payments", label: "Payments & Web3", icon: Wallet },
    { id: "security", label: "Security & Keys", icon: Shield },
  ];

  const isLiveEnabled = settings.hideLive !== true && settings.hideLive !== "true";
  const isStoreEnabled = settings.hideStore !== true && settings.hideStore !== "true";
  const isSocialEnabled = settings.hideSocial !== true && settings.hideSocial !== "true";
  const isNetworkEnabled = settings.hideNetwork !== true && settings.hideNetwork !== "true";
  const isDigEnabled = settings.hideDig !== true && settings.hideDig !== "true";

  return (
    <form onSubmit={handleSave} className="space-y-6 w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-base-content/10 pb-4 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <Cog className="text-primary shrink-0" size={24} />
          <h3 className="font-bold text-xl sm:text-2xl truncate">Site Settings</h3>
        </div>
        <button
          type="submit"
          className="btn btn-primary gap-2 w-full sm:w-auto shrink-0"
          disabled={loading}
        >
          <Save size={18} /> Save Changes
        </button>
      </div>

      {message && (
        <div className={`alert ${message.includes("Failed") ? "alert-error" : "alert-success"} shadow-level-1 rounded-xl mb-6`}>
          {message.includes("Failed") ? <OctagonAlert size={20} /> : <CheckCircle2 size={20} />}
          <span>{message}</span>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Categories Sidebar */}
        <div className="flex flex-row lg:flex-col gap-1 w-full lg:w-64 shrink-0 overflow-x-auto lg:overflow-x-visible pb-3 lg:pb-0 scrollbar-none border-b lg:border-b-0 lg:border-r border-base-content/10 lg:pr-6">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const active = subTab === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSubTab(cat.id as any)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-left font-semibold shrink-0 ${
                  active
                    ? "bg-primary text-primary-content shadow-lg shadow-primary/20 scale-[1.01]"
                    : "hover:bg-base-200/50 text-base-content/70 hover:text-base-content"
                }`}
              >
                <Icon size={18} className={active ? "opacity-100" : "opacity-60"} />
                <span className="text-sm">{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Focus Form Panel */}
        <div className="flex-1 w-full min-w-0 bg-base-200/40 p-4 sm:p-6 md:p-8 rounded-2xl border border-base-content/5 min-h-[480px]">
          {/* General Configuration */}
          {subTab === "general" && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center gap-2 mb-4 text-primary/80 border-b border-base-content/5 pb-2">
                <Layout size={20} />
                <h4 className="font-bold text-base tracking-normal">General Configuration</h4>
              </div>
              
              <div className="form-control">
                <label className="label">
                  <span className="label-text font-medium text-sm">Site Name</span>
                </label>
                <input
                  type="text"
                  className="input input-bordered bg-base-300/50 w-full"
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
                  className="textarea textarea-bordered bg-base-300/50 h-28 w-full"
                  value={settings.siteDescription || ""}
                  onChange={(e) => setSettings({ ...settings, siteDescription: e.target.value })}
                  placeholder="Describe your site for search engines and social sharing..."
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text font-medium text-sm">Community Link (e.g., Telegram, WhatsApp)</span>
                </label>
                <input
                  type="url"
                  className="input input-bordered bg-base-300/50 w-full"
                  value={settings.communityLink || ""}
                  onChange={(e) => setSettings({ ...settings, communityLink: e.target.value })}
                  placeholder="https://t.me/yourgroup or https://chat.whatsapp.com/..."
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text font-medium text-sm">Public URL</span>
                </label>
                <input
                  type="url"
                  className="input input-bordered bg-base-300/50 w-full"
                  value={settings.publicUrl || ""}
                  onChange={(e) => setSettings({ ...settings, publicUrl: e.target.value })}
                  placeholder="https://sudorecords.dev"
                />
                <label className="label">
                  <span className="label-text-alt opacity-40">Required for ActivityPub federation. Must contain protocol (e.g. https://) and domain.</span>
                </label>
              </div>

              <div className="form-control pt-4 border-t border-base-content/5 mt-4">
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
                <p className="text-[11px] opacity-40 px-1 mt-1">If enabled, anyone can create an account on your node.</p>
              </div>

              <div className="form-control pt-4 border-t border-base-content/5 mt-4">
                <label className="label cursor-pointer justify-between">
                  <div className="flex items-center gap-2">
                    <Shield size={16} className="opacity-60" />
                    <span className="label-text font-medium">Listener Self-Publish</span>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary toggle-sm"
                    checked={settings.listenerSelfPublish === true || (settings.listenerSelfPublish as unknown) === "true"}
                    onChange={(e) =>
                      setSettings({ ...settings, listenerSelfPublish: e.target.checked })
                    }
                  />
                </label>
                <p className="text-[11px] opacity-40 px-1 mt-1">If enabled, listeners can create an artist profile and publish releases directly without admin approval.</p>

                {(settings.listenerSelfPublish === true || (settings.listenerSelfPublish as unknown) === "true") && (
                  <div className="mt-3 pl-6">
                    <label className="label py-1">
                      <span className="label-text text-sm">Default storage quota (MB)</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      className="input input-bordered input-sm w-40"
                      value={settings.listenerSelfPublishQuota ?? 1024}
                      onChange={(e) =>
                        setSettings({ ...settings, listenerSelfPublishQuota: e.target.value })
                      }
                    />
                    <p className="text-[11px] opacity-40 px-1 mt-1">Physical-upload quota assigned to a listener when they self-publish. Default 1024 MB (1&nbsp;GB); 0 = unlimited. Per-user quotas can still be adjusted in the Users panel.</p>
                  </div>
                )}
              </div>

              <div className="form-control pt-4 border-t border-base-content/5 mt-4">
                <label className="label">
                  <span className="label-text font-medium">Scheduled Library Scan</span>
                </label>
                <select
                  className="select select-bordered select-sm bg-base-300/50"
                  value={(settings.scheduledScanHour as string) ?? ""}
                  onChange={(e) => setSettings({ ...settings, scheduledScanHour: e.target.value })}
                >
                  <option value="">Disabled</option>
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={String(h)}>{String(h).padStart(2, "0")}:00</option>
                  ))}
                </select>
                <p className="text-[11px] opacity-40 px-1 mt-1">Run a full library scan automatically once a day at this hour (server time). Pick an off-peak hour to keep imports away from listener traffic.</p>
              </div>
            </div>
          )}

          {/* Customize Modules */}
          {subTab === "features" && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center gap-2 mb-4 text-primary/80 border-b border-base-content/5 pb-2">
                <Cog size={20} />
                <h4 className="font-bold text-base tracking-normal">Customize Modules</h4>
              </div>
              <p className="text-xs opacity-60">
                Configure which navigation menus and features are enabled on this instance. Disabling a feature hides it from navigation for all users.
              </p>

              <div className="form-control bg-base-300/20 p-4 rounded-xl border border-base-content/5 mt-4">
                <label className="label cursor-pointer justify-between">
                  <div>
                    <span className="label-text font-bold">Show Live Streaming</span>
                    <p className="text-[11px] opacity-50 mt-0.5">Allow artists to start live audio streams and display the "Live" section in navigation.</p>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary toggle-md shrink-0 ml-4"
                    checked={isLiveEnabled}
                    onChange={(e) => setSettings({ ...settings, hideLive: !e.target.checked })}
                  />
                </label>
              </div>

              <div className="form-control bg-base-300/20 p-4 rounded-xl border border-base-content/5 mt-4">
                <label className="label cursor-pointer justify-between">
                  <div>
                    <span className="label-text font-bold">Show Digital Store</span>
                    <p className="text-[11px] opacity-50 mt-0.5">Display the digital store and membership options in navigation. (Make sure Stripe or Web3 is configured).</p>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary toggle-md shrink-0 ml-4"
                    checked={isStoreEnabled}
                    onChange={(e) => setSettings({ ...settings, hideStore: !e.target.checked })}
                  />
                </label>
              </div>

              <div className="form-control bg-base-300/20 p-4 rounded-xl border border-base-content/5 mt-4">
                <label className="label cursor-pointer justify-between">
                  <div>
                    <span className="label-text font-bold">Show Artist Social Hub</span>
                    <p className="text-[11px] opacity-50 mt-0.5">Enable the ActivityPub community feeds, profile setups, and automation pages for artists.</p>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary toggle-md shrink-0 ml-4"
                    checked={isSocialEnabled}
                    onChange={(e) => setSettings({ ...settings, hideSocial: !e.target.checked })}
                  />
                </label>
              </div>

              <div className="form-control bg-base-300/20 p-4 rounded-xl border border-base-content/5 mt-4">
                <label className="label cursor-pointer justify-between">
                  <div>
                    <span className="label-text font-bold">Show Federated Network</span>
                    <p className="text-[11px] opacity-50 mt-0.5">Allow users to discover music and instances across the network.</p>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary toggle-md shrink-0 ml-4"
                    checked={isNetworkEnabled}
                    onChange={(e) => setSettings({ ...settings, hideNetwork: !e.target.checked })}
                  />
                </label>
              </div>

              <div className="form-control bg-base-300/20 p-4 rounded-xl border border-base-content/5 mt-4">
                <label className="label cursor-pointer justify-between">
                  <div>
                    <span className="label-text font-bold">Show Crate Digging (Dig)</span>
                    <p className="text-[11px] opacity-50 mt-0.5">Allow users to find music via Bandcamp collectors seed crawling.</p>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary toggle-md shrink-0 ml-4"
                    checked={isDigEnabled}
                    onChange={(e) => setSettings({ ...settings, hideDig: !e.target.checked })}
                  />
                </label>
              </div>


              <div className="form-control bg-base-300/20 p-4 rounded-xl border border-base-content/5 mt-4">
                <label className="label cursor-pointer justify-between">
                  <div>
                    <span className="label-text font-bold">Message Board</span>
                    <p className="text-[11px] opacity-50 mt-0.5">Show the built-in community message board to logged-in users.</p>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary toggle-md shrink-0 ml-4"
                    checked={settings.chatEnabled === true || (settings.chatEnabled as unknown) === "true"}
                    onChange={(e) => setSettings({ ...settings, chatEnabled: e.target.checked })}
                  />
                </label>
              </div>

              <div className="form-control bg-base-300/20 p-4 rounded-xl border border-base-content/5 mt-4">
                <label className="label cursor-pointer justify-between">
                  <div>
                    <span className="label-text font-bold">Enable Peer Sharing</span>
                    <p className="text-[11px] opacity-50 mt-0.5">Allow authorized users to connect local daemons and share folders of local music.</p>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary toggle-md shrink-0 ml-4"
                    checked={settings.peerEnabled === true || (settings.peerEnabled as unknown) === "true"}
                    onChange={(e) => setSettings({ ...settings, peerEnabled: e.target.checked })}
                  />
                </label>
              </div>

              <div className="form-control bg-base-300/20 p-4 rounded-xl border border-base-content/5 mt-4">
                <label className="label cursor-pointer justify-between">
                  <div>
                    <span className="label-text font-bold">Allow Peer Downloads</span>
                    <p className="text-[11px] opacity-50 mt-0.5">Permit downloading tracks shared by connected peers (otherwise only streaming is allowed).</p>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary toggle-md shrink-0 ml-4"
                    checked={settings.peerAllowDownloads !== false && (settings.peerAllowDownloads as unknown) !== "false"}
                    onChange={(e) => setSettings({ ...settings, peerAllowDownloads: e.target.checked })}
                  />
                </label>
              </div>
            </div>
          )}

          {/* Branding Settings */}
          {subTab === "branding" && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center gap-2 mb-4 text-accent/80 border-b border-base-content/5 pb-2">
                <Palette size={20} />
                <h4 className="font-bold text-base tracking-normal">Branding & Appearance</h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text font-medium text-sm">Background URL</span>
                    </label>
                    <input
                      type="text"
                      className="input input-bordered bg-base-300/50 w-full"
                      value={settings.backgroundImage || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSettings({ ...settings, backgroundImage: val });
                        // Live preview: update the dedicated bg layer
                        const bgLayer = document.querySelector(".tc-bg-layer") as HTMLElement;
                        if (val) {
                          if (bgLayer) {
                            bgLayer.style.backgroundImage = `url(${val})`;
                          }
                          const drawer = document.querySelector(".drawer");
                          if (drawer) drawer.classList.add("has-custom-bg");
                        } else {
                          if (bgLayer) bgLayer.style.backgroundImage = '';
                          const drawer = document.querySelector(".drawer");
                          if (drawer) drawer.classList.remove("has-custom-bg");
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
                          const bgLayer = document.querySelector(".tc-bg-layer") as HTMLElement;
                          if (bgLayer) {
                            bgLayer.style.backgroundImage = `url(${url})`;
                          }
                          const drawer = document.querySelector(".drawer");
                          if (drawer) drawer.classList.add("has-custom-bg");
                        }
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-4">
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
                        applyThemeFont(font);
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
                      step="2"
                      className="range range-xs range-primary"
                      value={parseInt(settings.themeBlur || "10px")}
                      onChange={(e) => {
                        const blurValue = `${e.target.value}px`;
                        setSettings({ ...settings, themeBlur: blurValue });
                        // Update CSS var for the dedicated bg layer filter
                        document.documentElement.style.setProperty("--custom-bg-blur", blurValue);
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Brand Colors */}
              <div className="pt-4 border-t border-base-content/5">
                <h5 className="font-bold text-sm mb-3 flex items-center gap-2 opacity-70">
                  <Palette size={14} />
                  Brand Colors
                </h5>
                <p className="text-[11px] opacity-50 mb-4">Override the theme's Primary and Accent colors across the entire site. Leave empty to use the theme default.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text font-medium text-sm">Brand Primary</span>
                    </label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="color"
                        className="w-10 h-10 rounded-lg border border-base-content/10 cursor-pointer bg-transparent p-0.5"
                        value={settings.brandPrimary || "#8b5cf6"}
                        onChange={(e) => {
                          const color = e.target.value;
                          setSettings({ ...settings, brandPrimary: color });
                          document.documentElement.style.setProperty("--color-primary", color);
                        }}
                      />
                      <input
                        type="text"
                        className="input input-bordered input-sm bg-base-300/50 flex-1 font-mono text-xs"
                        value={settings.brandPrimary || ""}
                        onChange={(e) => {
                          const color = e.target.value;
                          setSettings({ ...settings, brandPrimary: color });
                          if (color) document.documentElement.style.setProperty("--color-primary", color);
                          else document.documentElement.style.removeProperty("--color-primary");
                        }}
                        placeholder="Theme default"
                      />
                      {settings.brandPrimary && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs btn-square tooltip tooltip-left"
                          data-tip="Reset to theme default"
                          onClick={() => {
                            setSettings({ ...settings, brandPrimary: "" });
                            document.documentElement.style.removeProperty("--color-primary");
                          }}
                        >
                          <RotateCcw size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="form-control">
                    <label className="label">
                      <span className="label-text font-medium text-sm">Brand Accent</span>
                    </label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="color"
                        className="w-10 h-10 rounded-lg border border-base-content/10 cursor-pointer bg-transparent p-0.5"
                        value={settings.brandAccent || "#22d3ee"}
                        onChange={(e) => {
                          const color = e.target.value;
                          setSettings({ ...settings, brandAccent: color });
                          document.documentElement.style.setProperty("--color-accent", color);
                        }}
                      />
                      <input
                        type="text"
                        className="input input-bordered input-sm bg-base-300/50 flex-1 font-mono text-xs"
                        value={settings.brandAccent || ""}
                        onChange={(e) => {
                          const color = e.target.value;
                          setSettings({ ...settings, brandAccent: color });
                          if (color) document.documentElement.style.setProperty("--color-accent", color);
                          else document.documentElement.style.removeProperty("--color-accent");
                        }}
                        placeholder="Theme default"
                      />
                      {settings.brandAccent && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs btn-square tooltip tooltip-left"
                          data-tip="Reset to theme default"
                          onClick={() => {
                            setSettings({ ...settings, brandAccent: "" });
                            document.documentElement.style.removeProperty("--color-accent");
                          }}
                        >
                          <RotateCcw size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-base-content/5">
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
                    <span className="label-text-alt opacity-50 text-[11px]">This image represents your node in the global network list.</span>
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
                    <span className="label-text-alt opacity-50 text-[11px]">This logo will appear in the top-left corner of the sidebar.</span>
                  </label>
                </div>
              </div>

              {/* Image previews with remove buttons */}
              <div className="flex flex-wrap gap-4 mt-2">
                {settings.backgroundImage && (
                  <div className="text-xs flex items-center gap-2 opacity-80 bg-base-300/30 p-2 rounded-lg border border-base-content/5 max-w-xs">
                    <div className="w-8 h-8 rounded bg-cover bg-center shrink-0 border border-base-content/10" style={{ backgroundImage: `url(${bust(settings.backgroundImage)})` }}></div>
                    <span className="truncate flex-1">Background</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs btn-square text-error/70 hover:text-error"
                      title="Remove background"
                      onClick={async () => {
                        try {
                          await API.removeBackgroundImage();
                          setSettings({ ...settings, backgroundImage: "" });
                          setImageCacheBust(Date.now());
                          // Clear live preview
                          const bgLayer = document.querySelector(".tc-bg-layer") as HTMLElement;
                          if (bgLayer) bgLayer.style.backgroundImage = '';
                          const drawer = document.querySelector(".drawer");
                          if (drawer) drawer.classList.remove("has-custom-bg");
                          setMessage("Background image removed.");
                        } catch (e: any) {
                          setMessage(`Failed to remove background: ${e.message}`);
                        }
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
                {settings.coverImage && (
                  <div className="text-xs flex items-center gap-2 opacity-80 bg-base-300/30 p-2 rounded-lg border border-base-content/5 max-w-xs">
                    <div className="w-8 h-8 rounded bg-cover bg-center shrink-0 border border-base-content/10" style={{ backgroundImage: `url(${bust(settings.coverImage)})` }}></div>
                    <span className="truncate flex-1">Node Cover</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs btn-square text-error/70 hover:text-error"
                      title="Remove cover"
                      onClick={async () => {
                        try {
                          await API.removeSiteCover();
                          setSettings({ ...settings, coverImage: "" });
                          setImageCacheBust(Date.now());
                          setMessage("Cover image removed.");
                        } catch (e: any) {
                          setMessage(`Failed to remove cover: ${e.message}`);
                        }
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
                {settings.siteLogo && (
                  <div className="text-xs flex items-center gap-2 opacity-80 bg-base-300/30 p-2 rounded-lg border border-base-content/5 max-w-xs">
                    <div className="w-8 h-8 rounded bg-contain bg-center bg-no-repeat shrink-0 border border-base-content/10" style={{ backgroundImage: `url(${bust(settings.siteLogo)})` }}></div>
                    <span className="truncate flex-1">Site Logo</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs btn-square text-error/70 hover:text-error"
                      title="Remove logo"
                      onClick={async () => {
                        try {
                          await API.removeSiteLogo();
                          setSettings({ ...settings, siteLogo: "" });
                          setImageCacheBust(Date.now());
                          setMessage("Site logo removed.");
                        } catch (e: any) {
                          setMessage(`Failed to remove logo: ${e.message}`);
                        }
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Payments & Web3 */}
          {subTab === "payments" && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center gap-2 mb-4 text-yellow-400 border-b border-base-content/5 pb-2">
                <Wallet size={20} />
                <h4 className="font-bold text-base tracking-normal">Payments &amp; Web3</h4>
              </div>

              <label className="label flex w-full whitespace-normal cursor-pointer justify-between items-start gap-4 bg-base-300/40 p-4 rounded-xl border border-base-content/5">
                <div className="flex-1 min-w-0">
                  <span className="label-text font-bold block break-words">Enable Web3 (NFT store &amp; crypto payments)</span>
                  <p className="text-[11px] opacity-50 mt-1 leading-relaxed break-words">
                    Off: artists sell via Stripe / direct payments only — the cleanest setup.
                    On: unlock the on-chain NFT store, the smart-contract release mode and treasury sync below.
                    Configure Stripe keys in the <span className="font-semibold">Integrations</span> tab.
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-warning toggle-md shrink-0 mt-1"
                  checked={web3Enabled}
                  onChange={(e) => setSettings({ ...settings, web3Enabled: e.target.checked })}
                />
              </label>

              {web3Enabled ? (
                <div className="space-y-4 pt-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="form-control">
                      <label className="label">
                        <span className="label-text font-medium text-sm">Checkout Contract</span>
                      </label>
                      <input
                        type="text"
                        className="input input-bordered bg-base-300/50 font-mono text-xs w-full"
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
                        className="input input-bordered bg-base-300/50 font-mono text-xs w-full"
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
                          <p className="text-[11px] opacity-70 text-success">NFT and Checkout contracts are correctly configured.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col md:flex-row items-center gap-4 bg-base-300/30 p-4 rounded-xl">
                        <div className="flex-1 opacity-60 text-xs">
                          <p>You haven't deployed your smart contracts yet. You can deploy them automatically on Base Network.</p>
                        </div>
                        <button
                          type="button"
                          className="btn btn-secondary btn-md rounded-xl px-8 shrink-0"
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
              ) : (
                <div className="text-xs opacity-50 bg-base-300/30 p-3 rounded-lg border border-base-content/5">
                  Web3 disabled. Releases sell through Stripe / direct payments. Turn this on to deploy an NFT store and enable smart-contract releases.
                </div>
              )}

              <div className="bg-base-300/20 p-6 rounded-2xl border border-base-content/5 space-y-4 pt-4 border-t border-base-content/5 mt-4">
                <div className="flex items-center gap-2 mb-2 text-green-400">
                  <Save size={16} />
                  <h4 className="font-bold text-xs tracking-normal uppercase">Revenue & Fees (Label Admin)</h4>
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text font-medium text-sm">Monthly Subscription Price (USD)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-base-content/50 font-bold">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="input input-bordered bg-base-300/50 w-40"
                      value={settings.membershipMonthlyPrice ?? 10}
                      onChange={(e) => setSettings({ ...settings, membershipMonthlyPrice: e.target.value })}
                      placeholder="10.00"
                    />
                  </div>
                  <label className="label">
                    <span className="label-text-alt opacity-40 text-[11px]">Price charged for a monthly membership via Stripe Checkout. Applies to the "Subscribe" flow in the Store.</span>
                  </label>
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
                      className="input input-bordered bg-base-300/50 w-full"
                      value={settings.adminFeePercentage || 0}
                      onChange={(e) => setSettings({ ...settings, adminFeePercentage: e.target.value })}
                      placeholder="0"
                    />
                    <label className="label">
                      <span className="label-text-alt opacity-40 text-[11px]">Percentage fee taken from direct payments. For smart contracts, this is fixed at 15%.</span>
                    </label>
                  </div>

                  <div className="form-control">
                    <label className="label">
                      <span className="label-text font-medium text-sm">Admin Treasury Wallet</span>
                    </label>
                    <input
                      type="text"
                      className="input input-bordered bg-base-300/50 font-mono text-xs w-full"
                      value={settings.adminTreasuryAddress || ""}
                      onChange={(e) => setSettings({ ...settings, adminTreasuryAddress: e.target.value })}
                      placeholder="0x..."
                    />
                    <label className="label">
                      <span className="label-text-alt opacity-40 text-[11px]">Address where label fees are sent.</span>
                    </label>
                  </div>
                </div>
                
                {web3Enabled && (
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
                )}
              </div>
            </div>
          )}

          {/* Security & System Keys */}
          {subTab === "security" && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center gap-2 mb-4 text-error/80 border-b border-base-content/5 pb-2">
                <Shield size={20} />
                <h4 className="font-bold text-base tracking-normal">Security & System Keys</h4>
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
                  <span className="label-text-alt text-error/80 text-[11px] flex items-center gap-1 font-medium mt-1">
                    <OctagonAlert size={12} />
                    WARNING: This is the server's master cryptographic key. Keep it secret and secure. It is used to decrypt all Zen identities and derive user wallets.
                  </span>
                </label>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end pt-6 border-t border-base-content/10">
        <button
          type="submit"
          className="btn btn-primary btn-lg rounded-xl px-12 gap-3 shadow-lg"
          disabled={loading}
        >
          {loading ? <span className="loading loading-spinner loading-md"></span> : <Save size={20} />}
          Save All Settings
        </button>
      </div>
    </form>
  );
};

