/**
 * Internationalization system for Tunecamp Wizard
 * Supports Italian (it) and English (en)
 */

export type Language = 'it' | 'en';

export interface Translations {
  welcome: {
    title: string;
    subtitle: string;
    description: string;
    selectLanguage: string;
    start: string;
  };
  catalog: {
    title: string;
    subtitle: string;
    catalogTitle: string;
    catalogTitlePlaceholder: string;
    catalogDescription: string;
    catalogDescriptionPlaceholder: string;
    catalogUrl: string;
    catalogUrlPlaceholder: string;
  };
  artist: {
    title: string;
    subtitle: string;
    artistName: string;
    artistNamePlaceholder: string;
    bio: string;
    bioPlaceholder: string;
    photo: string;
    photoHelp: string;
    socialLinks: string;
    addLink: string;
    donationLinks: string;
    donationPlatform: string;
    donationUrl: string;
    donationDescription: string;
    addDonation: string;
  };
  release: {
    title: string;
    subtitle: string;
    releaseTitle: string;
    releaseTitlePlaceholder: string;
    releaseDate: string;
    description: string;
    descriptionPlaceholder: string;
    genres: string;
    genresPlaceholder: string;
    genresHelp: string;
    cover: string;
    coverHelp: string;
  };
  download: {
    title: string;
    subtitle: string;
    selectMode: string;
    modes: {
      free: { name: string; description: string };
      paycurtain: { name: string; description: string };
      codes: { name: string; description: string };
      none: { name: string; description: string };
    };
    price: string;
    pricePlaceholder: string;
    paypalLink: string;
    stripeLink: string;
  };
  summary: {
    title: string;
    subtitle: string;
    preview: string;
    catalogInfo: string;
    artistInfo: string;
    releaseInfo: string;
    downloadInfo: string;
    generate: string;
    download: string;
    downloadZip: string;
    success: string;
    successMessage: string;
    nextSteps: string;
    step1: string;
    step2: string;
    step3: string;
  };
  common: {
    next: string;
    back: string;
    skip: string;
    cancel: string;
    save: string;
    edit: string;
    delete: string;
    required: string;
    optional: string;
    step: string;
    of: string;
    loading: string;
    error: string;
    success: string;
  };
  validation: {
    required: string;
    invalidUrl: string;
    invalidEmail: string;
    invalidDate: string;
  };
  platforms: {
    website: string;
    bandcamp: string;
    spotify: string;
    soundcloud: string;
    youtube: string;
    instagram: string;
    twitter: string;
    facebook: string;
    tiktok: string;
    mastodon: string;
    paypal: string;
    kofi: string;
    patreon: string;
    buymeacoffee: string;
  };
}

export const translations: Record<Language, Translations> = {
  it: {
    welcome: {
      title: "Benvenuto in Tunecamp",
      subtitle: "Crea il tuo sito musicale in pochi minuti",
      description: "Tunecamp ti aiuta a creare un sito web statico per la tua musica. Nessun database, nessun server complicato - solo file HTML che puoi hostare ovunque.",
      selectLanguage: "Seleziona la tua lingua",
      start: "Iniziamo!"
    },
    catalog: {
      title: "Configura il Catalogo",
      subtitle: "Informazioni base del tuo sito musicale",
      catalogTitle: "Titolo del Catalogo",
      catalogTitlePlaceholder: "Es: La Mia Musica",
      catalogDescription: "Descrizione",
      catalogDescriptionPlaceholder: "Una breve descrizione del tuo catalogo musicale",
      catalogUrl: "URL del Sito",
      catalogUrlPlaceholder: "https://tuodominio.com"
    },
    artist: {
      title: "Informazioni Artista",
      subtitle: "Racconta chi sei",
      artistName: "Nome Artista",
      artistNamePlaceholder: "Il tuo nome artistico",
      bio: "Biografia",
      bioPlaceholder: "Racconta la tua storia musicale...",
      photo: "Foto Artista",
      photoHelp: "Aggiungerai la foto nella cartella del catalogo",
      socialLinks: "Link Social",
      addLink: "Aggiungi Link",
      donationLinks: "Link per Donazioni",
      donationPlatform: "Piattaforma",
      donationUrl: "URL",
      donationDescription: "Descrizione",
      addDonation: "Aggiungi Donazione"
    },
    release: {
      title: "Prima Release",
      subtitle: "Configura il tuo primo album o singolo",
      releaseTitle: "Titolo",
      releaseTitlePlaceholder: "Es: Il Mio Primo Album",
      releaseDate: "Data di Uscita",
      description: "Descrizione",
      descriptionPlaceholder: "Descrivi questa release...",
      genres: "Generi",
      genresPlaceholder: "Electronic, Ambient, Experimental",
      genresHelp: "Separa i generi con virgole",
      cover: "Copertina",
      coverHelp: "Aggiungerai l'immagine nella cartella della release"
    },
    download: {
      title: "Modalita Download",
      subtitle: "Come vuoi distribuire la tua musica?",
      selectMode: "Seleziona una modalita",
      modes: {
        free: { name: "Gratuito", description: "Download immediato senza restrizioni" },
        paycurtain: { name: "Paga Quanto Vuoi", description: "Suggerisci un prezzo, ma il download e' sempre possibile (sistema d'onore)" },
        codes: { name: "Codici Sblocco", description: "Proteggi i download con codici univoci (validati via GunDB)" },
        none: { name: "Solo Streaming", description: "Nessun download, solo ascolto in streaming" }
      },
      price: "Prezzo Suggerito",
      pricePlaceholder: "10.00",
      paypalLink: "Link PayPal",
      stripeLink: "Link Stripe"
    },
    summary: {
      title: "Riepilogo",
      subtitle: "Controlla la configurazione prima di generare",
      preview: "Anteprima",
      catalogInfo: "Informazioni Catalogo",
      artistInfo: "Informazioni Artista",
      releaseInfo: "Informazioni Release",
      downloadInfo: "Modalita Download",
      generate: "Genera Catalogo",
      download: "Scarica",
      downloadZip: "Scarica ZIP",
      success: "Catalogo Generato!",
      successMessage: "Il tuo catalogo e' stato creato con successo.",
      nextSteps: "Prossimi Passi",
      step1: "Estrai il file ZIP nella cartella desiderata",
      step2: "Aggiungi i tuoi file audio nella cartella releases/[nome-album]/",
      step3: "Esegui 'tunecamp build . -o public' per generare il sito"
    },
    common: {
      next: "Avanti",
      back: "Indietro",
      skip: "Salta",
      cancel: "Annulla",
      save: "Salva",
      edit: "Modifica",
      delete: "Elimina",
      required: "Obbligatorio",
      optional: "Opzionale",
      step: "Passo",
      of: "di",
      loading: "Caricamento...",
      error: "Errore",
      success: "Successo"
    },
    validation: {
      required: "Questo campo e' obbligatorio",
      invalidUrl: "URL non valido",
      invalidEmail: "Email non valida",
      invalidDate: "Data non valida"
    },
    platforms: {
      website: "Sito Web",
      bandcamp: "Bandcamp",
      spotify: "Spotify",
      soundcloud: "SoundCloud",
      youtube: "YouTube",
      instagram: "Instagram",
      twitter: "Twitter/X",
      facebook: "Facebook",
      tiktok: "TikTok",
      mastodon: "Mastodon",
      paypal: "PayPal",
      kofi: "Ko-fi",
      patreon: "Patreon",
      buymeacoffee: "Buy Me a Coffee"
    }
  },
  en: {
    welcome: {
      title: "Welcome to Tunecamp",
      subtitle: "Create your music website in minutes",
      description: "Tunecamp helps you create a static website for your music. No database, no complicated servers - just HTML files you can host anywhere.",
      selectLanguage: "Select your language",
      start: "Let's go!"
    },
    catalog: {
      title: "Configure Catalog",
      subtitle: "Basic information for your music site",
      catalogTitle: "Catalog Title",
      catalogTitlePlaceholder: "E.g.: My Music",
      catalogDescription: "Description",
      catalogDescriptionPlaceholder: "A brief description of your music catalog",
      catalogUrl: "Site URL",
      catalogUrlPlaceholder: "https://yourdomain.com"
    },
    artist: {
      title: "Artist Information",
      subtitle: "Tell us about yourself",
      artistName: "Artist Name",
      artistNamePlaceholder: "Your artist name",
      bio: "Biography",
      bioPlaceholder: "Tell your musical story...",
      photo: "Artist Photo",
      photoHelp: "You'll add the photo in the catalog folder",
      socialLinks: "Social Links",
      addLink: "Add Link",
      donationLinks: "Donation Links",
      donationPlatform: "Platform",
      donationUrl: "URL",
      donationDescription: "Description",
      addDonation: "Add Donation"
    },
    release: {
      title: "First Release",
      subtitle: "Configure your first album or single",
      releaseTitle: "Title",
      releaseTitlePlaceholder: "E.g.: My First Album",
      releaseDate: "Release Date",
      description: "Description",
      descriptionPlaceholder: "Describe this release...",
      genres: "Genres",
      genresPlaceholder: "Electronic, Ambient, Experimental",
      genresHelp: "Separate genres with commas",
      cover: "Cover Art",
      coverHelp: "You'll add the image in the release folder"
    },
    download: {
      title: "Download Mode",
      subtitle: "How do you want to distribute your music?",
      selectMode: "Select a mode",
      modes: {
        free: { name: "Free", description: "Immediate download without restrictions" },
        paycurtain: { name: "Pay What You Want", description: "Suggest a price, but download is always available (honor system)" },
        codes: { name: "Unlock Codes", description: "Protect downloads with unique codes (validated via GunDB)" },
        none: { name: "Streaming Only", description: "No downloads, streaming only" }
      },
      price: "Suggested Price",
      pricePlaceholder: "10.00",
      paypalLink: "PayPal Link",
      stripeLink: "Stripe Link"
    },
    summary: {
      title: "Summary",
      subtitle: "Review your configuration before generating",
      preview: "Preview",
      catalogInfo: "Catalog Information",
      artistInfo: "Artist Information",
      releaseInfo: "Release Information",
      downloadInfo: "Download Mode",
      generate: "Generate Catalog",
      download: "Download",
      downloadZip: "Download ZIP",
      success: "Catalog Generated!",
      successMessage: "Your catalog has been created successfully.",
      nextSteps: "Next Steps",
      step1: "Extract the ZIP file to your desired folder",
      step2: "Add your audio files to releases/[album-name]/",
      step3: "Run 'tunecamp build . -o public' to generate the site"
    },
    common: {
      next: "Next",
      back: "Back",
      skip: "Skip",
      cancel: "Cancel",
      save: "Save",
      edit: "Edit",
      delete: "Delete",
      required: "Required",
      optional: "Optional",
      step: "Step",
      of: "of",
      loading: "Loading...",
      error: "Error",
      success: "Success"
    },
    validation: {
      required: "This field is required",
      invalidUrl: "Invalid URL",
      invalidEmail: "Invalid email",
      invalidDate: "Invalid date"
    },
    platforms: {
      website: "Website",
      bandcamp: "Bandcamp",
      spotify: "Spotify",
      soundcloud: "SoundCloud",
      youtube: "YouTube",
      instagram: "Instagram",
      twitter: "Twitter/X",
      facebook: "Facebook",
      tiktok: "TikTok",
      mastodon: "Mastodon",
      paypal: "PayPal",
      kofi: "Ko-fi",
      patreon: "Patreon",
      buymeacoffee: "Buy Me a Coffee"
    }
  }
};

/**
 * Get translations for a specific language
 */
export function getTranslations(lang: Language): Translations {
  return translations[lang] || translations.en;
}

/**
 * Get a nested translation key
 */
export function t(lang: Language, key: string): string {
  const keys = key.split('.');
  let result: any = translations[lang] || translations.en;
  
  for (const k of keys) {
    if (result && typeof result === 'object' && k in result) {
      result = result[k];
    } else {
      return key; // Return key if not found
    }
  }
  
  return typeof result === 'string' ? result : key;
}

export default translations;
