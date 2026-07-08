export default class ArchiveOrgProvider {
    constructor() {
        this.id = "archive-org";
        this.name = "Internet Archive";
        this.version = "1.0.0";
        this.description = "Scarica audio libero da Archive.org. Plugin di test.";
        
        // Esempio di configSchema per dimostrare la UI dichiarativa
        this.configSchema = [
            {
                key: "archive_max_results",
                label: "Risultati Massimi",
                type: "text",
                placeholder: "10",
                required: false
            },
            {
                key: "archive_safe_search",
                label: "Safe Search (Filtra contenuti)",
                type: "boolean",
                required: false
            }
        ];
    }

    async init({ getSetting, logger }) {
        // Leggiamo i settings configurati dalla UI
        this.maxResults = getSetting("plugin_archive-org_archive_max_results") || "10";
        this.safeSearch = getSetting("plugin_archive-org_archive_safe_search") === "true";
        this.logger = logger;
        this.logger.info(`Archive.org plugin inizializzato. MaxResults: ${this.maxResults}, SafeSearch: ${this.safeSearch}`);
    }

    async search(query) {
        // Simuliamo una chiamata asincrona all'API
        await new Promise(r => setTimeout(r, 500));
        
        const safePrefix = this.safeSearch ? "[SAFE] " : "";
        
        // Ritorniamo dati fittizi nel formato standard
        return [
            { 
                id: "archive-item-1", 
                title: `${safePrefix}Risultato Test 1 - ${query}`, 
                artist: "Archive.org", 
                sizeBytes: 5242880, // 5MB
                source: this.id 
            },
            { 
                id: "archive-item-2", 
                title: `${safePrefix}Risultato Test 2 - ${query}`, 
                artist: "Archive.org", 
                sizeBytes: 3145728, // 3MB
                source: this.id 
            }
        ].slice(0, parseInt(this.maxResults));
    }

    async download(result, downloadDir) {
        // In un caso reale faremmo una fetch per streamare il file.
        this.logger.info(`Download simulato per: ${result.title} in ${downloadDir}`);
        throw new Error("Download non implementato in questo mock");
    }

    async isAvailable() {
        return true;
    }
}
