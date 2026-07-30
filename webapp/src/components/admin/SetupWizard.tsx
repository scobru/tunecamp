import React, { useState, useEffect } from "react";
import API from "../../services/api";
import type { SiteSettings } from "../../types";
import { useSiteSettingsStore } from "../../stores/useSiteSettingsStore";
import {
  User,
  Layers,
  Compass,
  Radio,
  Check,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Cog,
  Music2,
  MessageCircle
} from "lucide-react";

interface ProfilePreset {
  id: string;
  name: string;
  description: string;
  gradient: string;
  icon: React.ComponentType<any>;
  flags: {
    hideStore: boolean;
    hideSocial: boolean;
    hideNetwork: boolean;
    hideDig: boolean;
    hideLive: boolean;
    hideSamples: boolean;
    hideCollab: boolean;
    hideLab: boolean;
    // Inverted when saved: the stored setting is `peerChatEnabled`, but every
    // other module in this wizard is expressed as `hide*`, so keep it uniform.
    hideChat: boolean;
    allowPublicRegistration: boolean;
    listenerSelfPublish: boolean;
    mode: 'label' | 'community';
  };
  taglineTemplate: string;
  descTemplate: string;
  nextSteps: string[];
}

const PRESETS: Record<string, ProfilePreset> = {
  artist: {
    id: "artist",
    name: "Solo Artist",
    description: "Optimized to showcase your music, sell albums/tracks directly and connect across the Fediverse.",
    gradient: "from-purple-500/20 to-pink-500/20 border-purple-500/30 hover:border-purple-500/60",
    icon: User,
    flags: {
      hideStore: false,
      hideSocial: false,
      hideNetwork: true,
      hideDig: true,
      hideLive: true,
      hideSamples: true,
      hideCollab: true,
      hideLab: true,
      hideChat: true,
      allowPublicRegistration: false,
      listenerSelfPublish: false,
      mode: "label"
    },
    taglineTemplate: "[Artist Name]'s official site — Music & Contact",
    descTemplate: "Welcome to my independent music space. Listen to my latest releases, buy tracks in digital format and connect with me on social.",
    nextSteps: [
      "Upload your first album or single in the Releases section",
      "Set up Stripe or your Web3 wallet to receive payments directly",
      "Customize the site's look (Colors, Fonts, Covers and Logos)"
    ]
  },
  label: {
    id: "label",
    name: "Record Label",
    description: "Manage a roster of artists, publish releases under different artist profiles and sell music from the central store.",
    gradient: "from-blue-500/20 to-cyan-500/20 border-blue-500/30 hover:border-blue-500/60",
    icon: Layers,
    flags: {
      hideStore: false,
      hideSocial: false,
      hideNetwork: false,
      hideDig: true,
      hideLive: true,
      hideSamples: true,
      hideCollab: true,
      hideLab: true,
      hideChat: true,
      allowPublicRegistration: true,
      listenerSelfPublish: false,
      mode: "label"
    },
    taglineTemplate: "[Label Name] — Independent Label",
    descTemplate: "Official catalog of [Label Name]. Discover the artists on our roster, listen to the latest releases and support independent music by buying from the store.",
    nextSteps: [
      "Create artist profiles for your roster from the Users section",
      "Upload the first albums and link them to their respective artists",
      "Set up your payment credentials to start selling"
    ]
  },
  curator: {
    id: "curator",
    name: "Music Curator",
    description: "Find music from external sources (Dig), organize playlists, and interact with the community on the board.",
    gradient: "from-amber-500/20 to-orange-500/20 border-amber-500/30 hover:border-amber-500/60",
    icon: Compass,
    flags: {
      hideStore: true,
      hideSocial: false,
      hideNetwork: false,
      hideDig: false,
      hideLive: true,
      hideSamples: true,
      hideCollab: true,
      hideLab: true,
      hideChat: false,
      allowPublicRegistration: true,
      listenerSelfPublish: true,
      mode: "community"
    },
    taglineTemplate: "[Curator Name] — Playlists, Discoveries & Recommendations",
    descTemplate: "A space for sharing and discovering music curated by [Curator Name]. Discover new independent tracks and join the discussion on the board.",
    nextSteps: [
      "Open registrations and invite users to sign up",
      "Explore external archives with the Dig feature and import recommended tracks",
      "Start putting together your first public playlists"
    ]
  },
  streamer: {
    id: "streamer",
    name: "Web Radio / Streamer",
    description: "Focused on real-time audio broadcasting, live sets, non-stop radio and live interaction.",
    gradient: "from-emerald-500/20 to-teal-500/20 border-emerald-500/30 hover:border-emerald-500/60",
    icon: Radio,
    flags: {
      hideStore: true,
      hideSocial: false,
      hideNetwork: true,
      hideDig: false,
      hideLive: false,
      hideSamples: true,
      hideCollab: true,
      hideLab: true,
      hideChat: true,
      allowPublicRegistration: true,
      listenerSelfPublish: false,
      mode: "community"
    },
    taglineTemplate: "[Station Name] — Independent Radio Station",
    descTemplate: "Non-stop live radio. Listen to our streaming broadcasts and join the board chat in real time.",
    nextSteps: [
      "Set up your Icecast or RTMP credentials to start the audio stream",
      "Start your first DJ Set broadcast from the Radio panel",
      "Share your radio link to invite listeners"
    ]
  },
  soundDesigner: {
    id: "soundDesigner",
    name: "Sound Designer",
    description: "Built around free samples, loops and one-shots — share sample packs, let others download and credit you.",
    gradient: "from-fuchsia-500/20 to-violet-500/20 border-fuchsia-500/30 hover:border-fuchsia-500/60",
    icon: Music2,
    flags: {
      hideStore: true,
      hideSocial: false,
      hideNetwork: true,
      hideDig: true,
      hideLive: true,
      hideSamples: false,
      hideCollab: false,
      hideLab: false,
      hideChat: true,
      allowPublicRegistration: true,
      listenerSelfPublish: true,
      mode: "community"
    },
    taglineTemplate: "[Studio Name] — Free Samples & Sound Design",
    descTemplate: "Free samples, loops and one-shots from [Studio Name]. Download, credit and make something new.",
    nextSteps: [
      "Upload your first sample pack from the Publish page",
      "Pick a license (CC0, CC BY, CC BY-SA, or Royalty-Free) for your uploads",
      "Invite other sound designers to self-publish their own samples"
    ]
  },
  listeningRoom: {
    id: "listeningRoom",
    name: "Listening Room",
    description: "A chat room with a record player. Everything else is off: people talk in the lobby, listen to your library and connect their own Sidecamp folders.",
    gradient: "from-rose-500/20 to-red-500/20 border-rose-500/30 hover:border-rose-500/60",
    icon: MessageCircle,
    flags: {
      hideStore: true,
      hideSocial: true,
      hideNetwork: false,
      hideDig: true,
      hideLive: true,
      hideSamples: true,
      hideCollab: true,
      hideLab: true,
      hideChat: false,
      allowPublicRegistration: true,
      listenerSelfPublish: false,
      mode: "community"
    },
    taglineTemplate: "[Room Name] — Listening Room",
    descTemplate: "A small room for listening together. Join the lobby, talk to whoever is around and play from the shared library.",
    nextSteps: [
      "Open registrations so people can join the lobby",
      "Point Sidecamp at this instance to share a private folder with the room",
      "Send direct messages: they are end-to-end encrypted and never stored here"
    ]
  }
};

export const SetupWizard = () => {
  const { fetchFlags } = useSiteSettingsStore();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [profile, setProfile] = useState<string>("");
  const [currentSettings, setCurrentSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Step 2 variables
  const [flagsConfig, setFlagsConfig] = useState<typeof PRESETS.artist.flags | null>(null);

  // Step 3 variables
  const [siteName, setSiteName] = useState("");
  const [siteDescription, setSiteDescription] = useState("");

  useEffect(() => {
    API.getAdminSettings()
      .then((settings) => {
        setCurrentSettings(settings);
        if (settings.instanceProfile) {
          setProfile(settings.instanceProfile);
        }
      })
      .catch(console.error);
  }, []);

  const handleSelectProfile = (id: string) => {
    setProfile(id);
    const preset = PRESETS[id];
    setFlagsConfig({ ...preset.flags });

    // Prepopulate Site Name & Description if they are currently defaults or empty
    const currentName = currentSettings?.siteName || "";
    const isDefaultName = !currentName || currentName === "TuneCamp";
    const currentDesc = currentSettings?.siteDescription || "";

    const nameToUse = isDefaultName ? (id === "artist" ? "My Artist Name" : id === "label" ? "My Record Label" : "My Community") : currentName;
    setSiteName(nameToUse);

    const descToUse = currentDesc || preset.descTemplate.replace("[Artist Name]", nameToUse).replace("[Label Name]", nameToUse).replace("[Curator Name]", nameToUse).replace("[Station Name]", nameToUse).replace("[Studio Name]", nameToUse).replace("[Room Name]", nameToUse);
    setSiteDescription(descToUse);
  };

  const handleNextStep = () => {
    if (step === 1 && !profile) {
      setErrorMsg("Select a profile to continue.");
      return;
    }
    setErrorMsg("");
    setStep((prev) => (prev + 1) as any);
  };

  const handlePrevStep = () => {
    setErrorMsg("");
    setStep((prev) => (prev - 1) as any);
  };

  const computeWarnings = () => {
    if (!currentSettings || !flagsConfig) return [];
    const warnings: string[] = [];

    // Helper to evaluate truthiness
    const isTrue = (val: any) => val === true || val === "true";

    // Comparison logic: Warn if currently visible/enabled (value false for hide, true for enabled),
    // but proposed is hidden/disabled (value true for hide, false for enabled).
    if (flagsConfig.hideStore && !isTrue(currentSettings.hideStore)) {
      warnings.push("The Store will be disabled (hides the catalog and sales).");
    }
    if (flagsConfig.hideLive && !isTrue(currentSettings.hideLive)) {
      warnings.push("The Live Streaming section will be disabled.");
    }
    if (flagsConfig.hideNetwork && !isTrue(currentSettings.hideNetwork)) {
      warnings.push("Network/Federation features will be disabled.");
    }
    if (flagsConfig.hideDig && !isTrue(currentSettings.hideDig)) {
      warnings.push("The Dig section (audio crate-digging) will be disabled.");
    }
    if (flagsConfig.hideSamples && !isTrue(currentSettings.hideSamples)) {
      warnings.push("The Free Samples showcase will be disabled.");
    }
    if (flagsConfig.hideCollab && !isTrue(currentSettings.hideCollab)) {
      warnings.push("The Collab workspace will be disabled.");
    }
    if (flagsConfig.hideLab && !isTrue(currentSettings.hideLab)) {
      warnings.push("The Lab Apps section will be disabled.");
    }
    // Chat is stored as an enable flag, so the comparison is inverted here.
    if (flagsConfig.hideChat && isTrue(currentSettings.peerChatEnabled)) {
      warnings.push("Peer Chat will be disabled (the lobby and direct messages go away).");
    }
    if (!flagsConfig.allowPublicRegistration && isTrue(currentSettings.allowPublicRegistration)) {
      warnings.push("Public registrations will be disabled (only administrators can add users).");
    }
    if (!flagsConfig.listenerSelfPublish && isTrue(currentSettings.listenerSelfPublish)) {
      warnings.push("Self-publishing for newly registered listeners will be disabled.");
    }
    if (currentSettings.mode && flagsConfig.mode !== currentSettings.mode) {
      warnings.push(`The catalog mode will change from '${currentSettings.mode}' to '${flagsConfig.mode}'.`);
    }

    return warnings;
  };

  const handleSaveSettings = async () => {
    if (!flagsConfig || !currentSettings) return;
    setLoading(true);
    setErrorMsg("");
    try {
      const payload: Partial<SiteSettings> = {
        ...currentSettings,
        instanceProfile: profile,
        siteName,
        siteDescription,
        hideStore: flagsConfig.hideStore,
        hideSocial: flagsConfig.hideSocial,
        hideNetwork: flagsConfig.hideNetwork,
        hideDig: flagsConfig.hideDig,
        hideLive: flagsConfig.hideLive,
        hideSamples: flagsConfig.hideSamples,
        hideCollab: flagsConfig.hideCollab,
        hideLab: flagsConfig.hideLab,
        peerChatEnabled: !flagsConfig.hideChat,
        allowPublicRegistration: flagsConfig.allowPublicRegistration,
        listenerSelfPublish: flagsConfig.listenerSelfPublish,
        mode: flagsConfig.mode
      };

      await API.updateSettings(payload);
      // Refresh cached frontend settings
      await fetchFlags();
      setStep(4);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message || "Unable to save settings.");
    } finally {
      setLoading(false);
    }
  };

  const currentWarnings = computeWarnings();
  const selectedPreset = PRESETS[profile];

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-4">
      {/* Header and Step Indicators */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-base-content/5 pb-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="text-primary animate-pulse" />
            TuneCamp Setup Wizard
          </h2>
          <p className="text-sm opacity-60 mt-1">
            Tailor your TuneCamp instance to your specific needs in a few clicks.
          </p>
        </div>

        {/* DaisyUI Steps */}
        <ul className="steps steps-horizontal w-full md:w-auto">
          <li className={`step text-xs ${step >= 1 ? "step-primary font-semibold" : ""}`}>Profile</li>
          <li className={`step text-xs ${step >= 2 ? "step-primary font-semibold" : ""}`}>Modules</li>
          <li className={`step text-xs ${step >= 3 ? "step-primary font-semibold" : ""}`}>Identity</li>
          <li className={`step text-xs ${step >= 4 ? "step-primary font-semibold" : ""}`}>Done</li>
        </ul>
      </div>

      {errorMsg && (
        <div className="alert alert-error shadow-sm rounded-box py-3 text-sm">
          <span>{errorMsg}</span>
        </div>
      )}

      {/* STEP 1: Select Profile */}
      {step === 1 && (
        <div className="space-y-6">
          <h3 className="text-lg font-semibold text-center md:text-left">
            What kind of TuneCamp instance are you setting up?
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.values(PRESETS).map((p) => {
              const Icon = p.icon;
              const isSelected = profile === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => handleSelectProfile(p.id)}
                  className={`card bg-base-200/50 border-2 cursor-pointer transition-all duration-300 rounded-box hover:shadow-lg p-6 flex flex-col gap-3 relative overflow-hidden group bg-gradient-to-br ${p.gradient} ${
                    isSelected ? "border-primary ring-2 ring-primary/20 scale-[1.01]" : ""
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-xl bg-base-100/90 shadow-sm border border-base-content/5 transition-transform duration-300 group-hover:scale-110 ${isSelected ? "text-primary border-primary/20" : ""}`}>
                      <Icon size={24} />
                    </div>
                    <div>
                      <h4 className="font-bold text-lg">{p.name}</h4>
                      <p className="text-xs opacity-50 capitalize">{p.flags.mode} mode</p>
                    </div>
                  </div>
                  <p className="text-sm opacity-70 mt-1 leading-relaxed">{p.description}</p>
                  {isSelected && (
                    <div className="absolute right-4 top-4 bg-primary text-primary-content p-1 rounded-full">
                      <Check size={14} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex justify-end pt-4">
            <button
              onClick={handleNextStep}
              className="btn btn-primary shadow-md hover:shadow-lg gap-2"
              disabled={!profile}
            >
              Next <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Configure Modules / Warning Diff */}
      {step === 2 && flagsConfig && (
        <div className="space-y-6">
          <div className="bg-base-200/50 p-5 border border-base-content/5 rounded-box glass-effect">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-2">
              <Cog className="text-secondary" /> Modules enabled for: {selectedPreset.name}
            </h3>
            <p className="text-sm opacity-60 leading-relaxed">
              The selected profile enables or disables the following site features. You can adjust the initial settings here.
            </p>
          </div>

          {/* Warnings List (Diff) */}
          {currentWarnings.length > 0 && (
            <div className="alert alert-warning shadow-sm rounded-box border border-warning/20 bg-warning/5 p-4 flex flex-col items-start gap-2">
              <div className="flex items-center gap-2 font-bold text-sm text-warning-content">
                <AlertTriangle size={18} />
                <span>Warning: You are changing the current configuration</span>
              </div>
              <ul className="list-disc pl-5 text-xs text-warning-content/80 space-y-1 mt-1">
                {currentWarnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card bg-base-200/20 border border-base-content/5 p-5 rounded-box space-y-4">
              <h4 className="font-bold text-sm opacity-60 tracking-wider uppercase border-b border-base-content/5 pb-2">Site Sections</h4>

              <div className="form-control">
                <label className="label cursor-pointer justify-between py-1.5">
                  <div>
                    <span className="label-text font-semibold text-sm">Store Catalog</span>
                    <p className="text-[11px] opacity-50 mt-0.5">Show albums and enable checkout for sales</p>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary toggle-sm"
                    checked={!flagsConfig.hideStore}
                    onChange={(e) => setFlagsConfig({ ...flagsConfig, hideStore: !e.target.checked })}
                  />
                </label>
              </div>

              <div className="form-control">
                <label className="label cursor-pointer justify-between py-1.5">
                  <div>
                    <span className="label-text font-semibold text-sm">Social Feed (AP)</span>
                    <p className="text-[11px] opacity-50 mt-0.5">Manage Fediverse interactions, posts and timeline</p>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary toggle-sm"
                    checked={!flagsConfig.hideSocial}
                    onChange={(e) => setFlagsConfig({ ...flagsConfig, hideSocial: !e.target.checked })}
                  />
                </label>
              </div>

              <div className="form-control">
                <label className="label cursor-pointer justify-between py-1.5">
                  <div>
                    <span className="label-text font-semibold text-sm">Network & Federation</span>
                    <p className="text-[11px] opacity-50 mt-0.5">Show linked sites and the list of federated instances</p>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary toggle-sm"
                    checked={!flagsConfig.hideNetwork}
                    onChange={(e) => setFlagsConfig({ ...flagsConfig, hideNetwork: !e.target.checked })}
                  />
                </label>
              </div>

              <div className="form-control">
                <label className="label cursor-pointer justify-between py-1.5">
                  <div>
                    <span className="label-text font-semibold text-sm">Free Samples</span>
                    <p className="text-[11px] opacity-50 mt-0.5">Public samples showcase and sample uploads</p>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary toggle-sm"
                    checked={!flagsConfig.hideSamples}
                    onChange={(e) => setFlagsConfig({ ...flagsConfig, hideSamples: !e.target.checked })}
                  />
                </label>
              </div>
            </div>

            <div className="card bg-base-200/20 border border-base-content/5 p-5 rounded-box space-y-4">
              <h4 className="font-bold text-sm opacity-60 tracking-wider uppercase border-b border-base-content/5 pb-2">Access & More</h4>

              <div className="form-control">
                <label className="label cursor-pointer justify-between py-1.5">
                  <div>
                    <span className="label-text font-semibold text-sm">Live Streaming (Icecast)</span>
                    <p className="text-[11px] opacity-50 mt-0.5">Allows real-time streaming of external audio feeds</p>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary toggle-sm"
                    checked={!flagsConfig.hideLive}
                    onChange={(e) => setFlagsConfig({ ...flagsConfig, hideLive: !e.target.checked })}
                  />
                </label>
              </div>

              <div className="form-control">
                <label className="label cursor-pointer justify-between py-1.5">
                  <div>
                    <span className="label-text font-semibold text-sm">Dig (External Crate-Digging)</span>
                    <p className="text-[11px] opacity-50 mt-0.5">Import tracks from external databases or shared archives</p>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary toggle-sm"
                    checked={!flagsConfig.hideDig}
                    onChange={(e) => setFlagsConfig({ ...flagsConfig, hideDig: !e.target.checked })}
                  />
                </label>
              </div>

              <div className="form-control">
                <label className="label cursor-pointer justify-between py-1.5">
                  <div>
                    <span className="label-text font-semibold text-sm">Collab Workspace</span>
                    <p className="text-[11px] opacity-50 mt-0.5">Multitrack collaboration workspace for co-producing tracks</p>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary toggle-sm"
                    checked={!flagsConfig.hideCollab}
                    onChange={(e) => setFlagsConfig({ ...flagsConfig, hideCollab: !e.target.checked })}
                  />
                </label>
              </div>

              <div className="form-control">
                <label className="label cursor-pointer justify-between py-1.5">
                  <div>
                    <span className="label-text font-semibold text-sm">Lab Apps</span>
                    <p className="text-[11px] opacity-50 mt-0.5">Standalone tools and experiments in the Lab section</p>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary toggle-sm"
                    checked={!flagsConfig.hideLab}
                    onChange={(e) => setFlagsConfig({ ...flagsConfig, hideLab: !e.target.checked })}
                  />
                </label>
              </div>

              <div className="form-control">
                <label className="label cursor-pointer justify-between py-1.5">
                  <div>
                    <span className="label-text font-semibold text-sm">Peer Chat</span>
                    <p className="text-[11px] opacity-50 mt-0.5">Real-time lobby plus end-to-end encrypted direct messages</p>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary toggle-sm"
                    checked={!flagsConfig.hideChat}
                    onChange={(e) => setFlagsConfig({ ...flagsConfig, hideChat: !e.target.checked })}
                  />
                </label>
              </div>

              <div className="form-control">
                <label className="label cursor-pointer justify-between py-1.5">
                  <div>
                    <span className="label-text font-semibold text-sm">Open Registrations</span>
                    <p className="text-[11px] opacity-50 mt-0.5">Lets new visitors register an account on the site</p>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary toggle-sm"
                    checked={flagsConfig.allowPublicRegistration}
                    onChange={(e) => setFlagsConfig({ ...flagsConfig, allowPublicRegistration: e.target.checked })}
                  />
                </label>
              </div>

              <div className="form-control">
                <label className="label cursor-pointer justify-between py-1.5">
                  <div>
                    <span className="label-text font-semibold text-sm">Listener Publishing</span>
                    <p className="text-[11px] opacity-50 mt-0.5">Registered listeners can create profiles and post releases</p>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary toggle-sm"
                    checked={flagsConfig.listenerSelfPublish}
                    onChange={(e) => setFlagsConfig({ ...flagsConfig, listenerSelfPublish: e.target.checked })}
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-between pt-4">
            <button onClick={handlePrevStep} className="btn btn-ghost gap-2">
              <ArrowLeft size={16} /> Back
            </button>
            <button onClick={handleNextStep} className="btn btn-primary gap-2">
              Next <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Setup Site Details */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="bg-base-200/50 p-5 border border-base-content/5 rounded-box glass-effect">
            <h3 className="text-lg font-bold mb-2">Site Identity Details</h3>
            <p className="text-sm opacity-60 leading-relaxed">
              These texts define the branding of your TuneCamp instance. We've pre-filled them with a template for the <strong>{selectedPreset.name}</strong> profile, but you can change them now.
            </p>
          </div>

          <div className="space-y-4">
            <div className="form-control">
              <label className="label" htmlFor="wizard-siteName">
                <span className="label-text font-semibold text-sm">Site Name</span>
              </label>
              <input
                id="wizard-siteName"
                type="text"
                className="input input-bordered w-full bg-base-300/30"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                placeholder="e.g. My Roster / My Radio"
                required
              />
            </div>

            <div className="form-control">
              <label className="label" htmlFor="wizard-siteDesc">
                <span className="label-text font-semibold text-sm">Instance Description (About)</span>
              </label>
              <textarea
                id="wizard-siteDesc"
                className="textarea textarea-bordered w-full h-32 bg-base-300/30"
                value={siteDescription}
                onChange={(e) => setSiteDescription(e.target.value)}
                placeholder="Describe your radio station, label or artist profile..."
                required
              />
            </div>
          </div>

          <div className="flex justify-between pt-4">
            <button onClick={handlePrevStep} className="btn btn-ghost gap-2" disabled={loading}>
              <ArrowLeft size={16} /> Back
            </button>
            <button
              onClick={handleSaveSettings}
              className="btn btn-primary gap-2 min-w-[140px]"
              disabled={loading || !siteName.trim()}
            >
              {loading ? (
                <span className="loading loading-spinner loading-sm"></span>
              ) : (
                <>Save & Apply <Check size={16} /></>
              )}
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: Success & Checklist */}
      {step === 4 && (
        <div className="space-y-8 animate-fade-in text-center md:text-left">
          <div className="card bg-success/10 border border-success/20 p-6 sm:p-8 rounded-box flex flex-col md:flex-row items-center gap-6">
            <div className="p-4 bg-success/20 rounded-full text-success">
              <CheckCircle2 size={40} className="animate-bounce" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-success-content">Setup completed successfully!</h3>
              <p className="text-sm opacity-80 mt-1">
                Your TuneCamp instance has been set up with the <strong>{selectedPreset.name}</strong> profile.
              </p>
            </div>
          </div>

          <div className="card bg-base-200/40 border border-base-content/5 p-6 sm:p-8 rounded-box space-y-6">
            <div>
              <h4 className="text-lg font-bold">Recommended next steps:</h4>
              <p className="text-xs opacity-50 mt-0.5">Here are a few suggested actions to start using your instance:</p>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {selectedPreset.nextSteps.map((stepText, idx) => (
                <div key={idx} className="flex items-start gap-4 p-3 rounded-lg bg-base-100/50 border border-base-content/5">
                  <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  <p className="text-sm opacity-95">{stepText}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-center md:justify-end pt-4">
            <button
              onClick={() => {
                // Reload window to ensure sidebar modules list and settings are refetched cleanly
                window.location.reload();
              }}
              className="btn btn-primary btn-wide shadow-md"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
