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
  Cog
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
    hideDj: boolean;
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
    name: "Artista Singolo",
    description: "Ottimizzato per presentare la tua musica, vendere direttamente album/tracce e connetterti nel Fediverse.",
    gradient: "from-purple-500/20 to-pink-500/20 border-purple-500/30 hover:border-purple-500/60",
    icon: User,
    flags: {
      hideStore: false,
      hideSocial: false,
      hideNetwork: true,
      hideDig: true,
      hideLive: true,
      hideDj: true,
      allowPublicRegistration: false,
      listenerSelfPublish: false,
      mode: "label"
    },
    taglineTemplate: "Sito ufficiale di [Nome Artista] — Musica e Contatti",
    descTemplate: "Benvenuto nel mio spazio musicale indipendente. Ascolta le mie ultime uscite, acquista i brani in formato digitale e connettiti con me sui social.",
    nextSteps: [
      "Carica il tuo primo album o singolo nella sezione Releases",
      "Configura Stripe o il tuo wallet Web3 per ricevere i pagamenti direttamente",
      "Personalizza la grafica del sito (Colori, Font, Cover e Loghi)"
    ]
  },
  label: {
    id: "label",
    name: "Etichetta Discografica",
    description: "Gestisci un roster di artisti, pubblica release sotto diversi profili artista e vendi musica dallo store centrale.",
    gradient: "from-blue-500/20 to-cyan-500/20 border-blue-500/30 hover:border-blue-500/60",
    icon: Layers,
    flags: {
      hideStore: false,
      hideSocial: false,
      hideNetwork: false,
      hideDig: true,
      hideLive: true,
      hideDj: true,
      allowPublicRegistration: true,
      listenerSelfPublish: false,
      mode: "label"
    },
    taglineTemplate: "[Nome Label] — Etichetta Indipendente",
    descTemplate: "Catalogo ufficiale di [Nome Label]. Scopri gli artisti del nostro roster, ascolta le ultime novità e supporta la musica indipendente acquistando dallo store.",
    nextSteps: [
      "Crea i profili artista per il roster dalla sezione Users",
      "Carica i primi album associandoli ai rispettivi artisti",
      "Configura le credenziali di pagamento per avviare le vendite"
    ]
  },
  curator: {
    id: "curator",
    name: "Curatore Musicale",
    description: "Trova musica da fonti esterne (Dig), organizza playlist, interagisci con la community sul board.",
    gradient: "from-amber-500/20 to-orange-500/20 border-amber-500/30 hover:border-amber-500/60",
    icon: Compass,
    flags: {
      hideStore: true,
      hideSocial: false,
      hideNetwork: false,
      hideDig: false,
      hideLive: true,
      hideDj: false,
      allowPublicRegistration: true,
      listenerSelfPublish: true,
      mode: "community"
    },
    taglineTemplate: "[Nome Curatore] — Playlist, Scoperte e Consigli",
    descTemplate: "Spazio di condivisione e scoperta musicale curato da [Nome Curatore]. Scopri nuove tracce indipendenti e partecipa alla discussione sul board.",
    nextSteps: [
      "Apri le registrazioni e invita gli utenti a iscriversi",
      "Esplora archivi esterni con la funzione Dig e importa tracce consigliate",
      "Inizia a comporre le tue prime playlist pubbliche"
    ]
  },
  streamer: {
    id: "streamer",
    name: "Web Radio / Streamer",
    description: "Concentrato sulla trasmissione audio in tempo reale, live set, radio no-stop e interazione live.",
    gradient: "from-emerald-500/20 to-teal-500/20 border-emerald-500/30 hover:border-emerald-500/60",
    icon: Radio,
    flags: {
      hideStore: true,
      hideSocial: false,
      hideNetwork: true,
      hideDig: false,
      hideLive: false,
      hideDj: false,
      allowPublicRegistration: true,
      listenerSelfPublish: false,
      mode: "community"
    },
    taglineTemplate: "[Nome Stazione] — Stazione Radio Indipendente",
    descTemplate: "Radio in diretta live no-stop. Ascolta le nostre trasmissioni in streaming e partecipa alla chat del board in tempo reale.",
    nextSteps: [
      "Configura le credenziali Icecast o RTMP per avviare il flusso audio",
      "Avvia la tua prima trasmissione DJ Set dal pannello Radio",
      "Pubblica il link della tua radio per invitare gli ascoltatori"
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

    const nameToUse = isDefaultName ? (id === "artist" ? "Mio Nome Artista" : id === "label" ? "Mia Label Discografica" : "Mia Community") : currentName;
    setSiteName(nameToUse);

    const descToUse = currentDesc || preset.descTemplate.replace("[Nome Artista]", nameToUse).replace("[Nome Label]", nameToUse).replace("[Nome Curatore]", nameToUse).replace("[Nome Stazione]", nameToUse);
    setSiteDescription(descToUse);
  };

  const handleNextStep = () => {
    if (step === 1 && !profile) {
      setErrorMsg("Seleziona un profilo per continuare.");
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
      warnings.push("Lo Store verrà disattivato (nasconde il catalogo e le vendite).");
    }
    if (flagsConfig.hideLive && !isTrue(currentSettings.hideLive)) {
      warnings.push("La sezione Live Streaming verrà disattivata.");
    }
    if (flagsConfig.hideNetwork && !isTrue(currentSettings.hideNetwork)) {
      warnings.push("Le funzioni di Rete/Federazione verranno disattivate.");
    }
    if (flagsConfig.hideDig && !isTrue(currentSettings.hideDig)) {
      warnings.push("La sezione Dig (scavo audio) verrà disattivata.");
    }
    if (flagsConfig.hideDj && !isTrue(currentSettings.hideDj)) {
      warnings.push("La funzionalità DJ / Web Radio verrà disattivata.");
    }
    if (!flagsConfig.allowPublicRegistration && isTrue(currentSettings.allowPublicRegistration)) {
      warnings.push("Le registrazioni pubbliche verranno disattivate (solo gli amministratori possono aggiungere utenti).");
    }
    if (!flagsConfig.listenerSelfPublish && isTrue(currentSettings.listenerSelfPublish)) {
      warnings.push("La pubblicazione autonoma per i nuovi ascoltatori registrati verrà disattivata.");
    }
    if (currentSettings.mode && flagsConfig.mode !== currentSettings.mode) {
      warnings.push(`La modalità del catalogo cambierà da '${currentSettings.mode}' a '${flagsConfig.mode}'.`);
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
        hideDj: flagsConfig.hideDj,
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
      setErrorMsg(e?.message || "Impossibile salvare le impostazioni.");
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
            Configurazione Guidata TuneCamp
          </h2>
          <p className="text-sm opacity-60 mt-1">
            Adatta l'istanza TuneCamp alle tue specifiche esigenze in pochi clic.
          </p>
        </div>

        {/* DaisyUI Steps */}
        <ul className="steps steps-horizontal w-full md:w-auto">
          <li className={`step text-xs ${step >= 1 ? "step-primary font-semibold" : ""}`}>Profilo</li>
          <li className={`step text-xs ${step >= 2 ? "step-primary font-semibold" : ""}`}>Moduli</li>
          <li className={`step text-xs ${step >= 3 ? "step-primary font-semibold" : ""}`}>Identità</li>
          <li className={`step text-xs ${step >= 4 ? "step-primary font-semibold" : ""}`}>Fine</li>
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
            Che tipo di istanza TuneCamp stai configurando?
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
              Avanti <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Configure Modules / Warning Diff */}
      {step === 2 && flagsConfig && (
        <div className="space-y-6">
          <div className="bg-base-200/50 p-5 border border-base-content/5 rounded-box glass-effect">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-2">
              <Cog className="text-secondary" /> Moduli abilitati per: {selectedPreset.name}
            </h3>
            <p className="text-sm opacity-60 leading-relaxed">
              Il profilo selezionato abilita o disabilita le seguenti funzionalità del sito. Puoi regolare le impostazioni iniziali qui.
            </p>
          </div>

          {/* Warnings List (Diff) */}
          {currentWarnings.length > 0 && (
            <div className="alert alert-warning shadow-sm rounded-box border border-warning/20 bg-warning/5 p-4 flex flex-col items-start gap-2">
              <div className="flex items-center gap-2 font-bold text-sm text-warning-content">
                <AlertTriangle size={18} />
                <span>Attenzione: Stai modificando la configurazione corrente</span>
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
              <h4 className="font-bold text-sm opacity-60 tracking-wider uppercase border-b border-base-content/5 pb-2">Sezioni del Sito</h4>
              
              <div className="form-control">
                <label className="label cursor-pointer justify-between py-1.5">
                  <div>
                    <span className="label-text font-semibold text-sm">Store Catalogo</span>
                    <p className="text-[11px] opacity-50 mt-0.5">Mostra gli album e abilita il checkout per le vendite</p>
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
                    <p className="text-[11px] opacity-50 mt-0.5">Gestisci interazioni Fediverse, post e timeline</p>
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
                    <span className="label-text font-semibold text-sm">Rete & Federazione</span>
                    <p className="text-[11px] opacity-50 mt-0.5">Mostra siti collegati ed elenco istanze federate</p>
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
                    <span className="label-text font-semibold text-sm">DJ / Radio Web</span>
                    <p className="text-[11px] opacity-50 mt-0.5">Abilita pianificazione radio, playlist live ed automazioni</p>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary toggle-sm"
                    checked={!flagsConfig.hideDj}
                    onChange={(e) => setFlagsConfig({ ...flagsConfig, hideDj: !e.target.checked })}
                  />
                </label>
              </div>
            </div>

            <div className="card bg-base-200/20 border border-base-content/5 p-5 rounded-box space-y-4">
              <h4 className="font-bold text-sm opacity-60 tracking-wider uppercase border-b border-base-content/5 pb-2">Accesso & Altro</h4>
              
              <div className="form-control">
                <label className="label cursor-pointer justify-between py-1.5">
                  <div>
                    <span className="label-text font-semibold text-sm">Live Streaming (Icecast)</span>
                    <p className="text-[11px] opacity-50 mt-0.5">Consente lo streaming in tempo reale di flussi esterni</p>
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
                    <span className="label-text font-semibold text-sm">Dig (Scavo Esterno)</span>
                    <p className="text-[11px] opacity-50 mt-0.5">Importa brani da database esterni o archivi condivisi</p>
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
                    <span className="label-text font-semibold text-sm">Registrazioni Aperte</span>
                    <p className="text-[11px] opacity-50 mt-0.5">Consente a nuovi visitatori di registrare un account sul sito</p>
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
                    <span className="label-text font-semibold text-sm">Pubblicazione Ascoltatori</span>
                    <p className="text-[11px] opacity-50 mt-0.5">Gli ascoltatori registrati possono creare profili ed inserire release</p>
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
              <ArrowLeft size={16} /> Indietro
            </button>
            <button onClick={handleNextStep} className="btn btn-primary gap-2">
              Avanti <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Setup Site Details */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="bg-base-200/50 p-5 border border-base-content/5 rounded-box glass-effect">
            <h3 className="text-lg font-bold mb-2">Dettagli Identità del Sito</h3>
            <p className="text-sm opacity-60 leading-relaxed">
              Questi testi definiscono il brand della tua istanza TuneCamp. Li abbiamo pre-compilati con un modello per il profilo <strong>{selectedPreset.name}</strong>, ma puoi cambiarli ora.
            </p>
          </div>

          <div className="space-y-4">
            <div className="form-control">
              <label className="label" htmlFor="wizard-siteName">
                <span className="label-text font-semibold text-sm">Nome del Sito</span>
              </label>
              <input
                id="wizard-siteName"
                type="text"
                className="input input-bordered w-full bg-base-300/30"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                placeholder="es. Il mio Roster / La mia Radio"
                required
              />
            </div>

            <div className="form-control">
              <label className="label" htmlFor="wizard-siteDesc">
                <span className="label-text font-semibold text-sm">Descrizione Istanza (About)</span>
              </label>
              <textarea
                id="wizard-siteDesc"
                className="textarea textarea-bordered w-full h-32 bg-base-300/30"
                value={siteDescription}
                onChange={(e) => setSiteDescription(e.target.value)}
                placeholder="Descrivi la tua stazione radio, etichetta o profilo artista..."
                required
              />
            </div>
          </div>

          <div className="flex justify-between pt-4">
            <button onClick={handlePrevStep} className="btn btn-ghost gap-2" disabled={loading}>
              <ArrowLeft size={16} /> Indietro
            </button>
            <button
              onClick={handleSaveSettings}
              className="btn btn-primary gap-2 min-w-[140px]"
              disabled={loading || !siteName.trim()}
            >
              {loading ? (
                <span className="loading loading-spinner loading-sm"></span>
              ) : (
                <>Salva e Applica <Check size={16} /></>
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
              <h3 className="text-xl font-bold text-success-content">Configurazione completata con successo!</h3>
              <p className="text-sm opacity-80 mt-1">
                L'istanza TuneCamp è stata impostata con il profilo <strong>{selectedPreset.name}</strong>.
              </p>
            </div>
          </div>

          <div className="card bg-base-200/40 border border-base-content/5 p-6 sm:p-8 rounded-box space-y-6">
            <div>
              <h4 className="text-lg font-bold">Prossimi passi consigliati:</h4>
              <p className="text-xs opacity-50 mt-0.5">Ecco alcune azioni suggerite per iniziare a usare la tua istanza:</p>
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
              Vai alla Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
