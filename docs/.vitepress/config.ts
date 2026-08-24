import { defineConfig } from "vitepress";

export default defineConfig({
	title: "TuneCamp",
	description:
		"Federated self-hosted music platform for indie artists and labels",
	base: "/tunecamp/",

	themeConfig: {
		socialLinks: [
			{ icon: "github", link: "https://github.com/scobru/tunecamp" },
		],
		search: {
			provider: "local",
			options: {
				locales: {
					it: {
						translations: {
							button: {
								buttonText: "Cerca",
								buttonAriaLabel: "Cerca documenti",
							},
							modal: {
								noResultsText: "Nessun risultato trovato",
								resetButtonTitle: "Resetta ricerca",
								footer: {
									selectText: "per selezionare",
									navigateText: "per navigare",
									closeText: "per chiudere",
								},
							},
						},
					},
				},
			},
		},
	},

	locales: {
		root: {
			label: "English",
			lang: "en",
			themeConfig: {
				nav: [
					{ text: "Home", link: "/" },
					{ text: "Get Started", link: "/getting-started" },
					{ text: "API Reference", link: "/api-contracts" },
					{ text: "Status", link: "/STATUS" },
				],

				sidebar: [
					{
						text: "🚀 Getting Started",
						items: [
							{ text: "Quick Start", link: "/getting-started" },
							{ text: "Deploy on Railway", link: "/railway" },
							{ text: "API & Services Setup", link: "/api-setup-guide" },
							{ text: "Nginx", link: "/NGINX" },
							{ text: "Backup & Migration", link: "/backup-migration" },
						],
					},
					{
						text: "🎧 User Guide",
						items: [
							{ text: "Roles & Permissions", link: "/ROLES" },
							{ text: "Karma System (Archived)", link: "/karma" },
							{ text: "Radio", link: "/radio" },
							{ text: "Subsonic Protocol", link: "/subsonic" },
							{ text: "Social & Community", link: "/social-features" },
							{ text: "Becoming an Artist & Selling", link: "/community-mode" },
							{ text: "Payments & Monetization", link: "/payments" },
						],
					},
					{
						text: "🛠️ Administrator Guide",
						items: [
							{ text: "Federation (ActivityPub)", link: "/FEDERATION" },
							{ text: "Peer Sharing", link: "/sidecamp" },
							{ text: "Monitoring & Alerting", link: "/monitoring" },
							{ text: "Scaling", link: "/scaling" },
							{ text: "MCP Setup", link: "/mcp-setup-guide" },
						],
					},
					{
						text: "💻 Developer Guide",
						items: [
							{
								text: "Architecture Decisions",
								link: "/ARCHITECTURE-DECISIONS",
							},
							{ text: "Development Guide", link: "/development-guide" },
							{ text: "Contributing", link: "/CONTRIBUTING" },
							{ text: "Backend & Data Model", link: "/architecture-backend" },
							{ text: "Webapp Architecture", link: "/architecture-webapp" },
							{ text: "API Contracts", link: "/api-contracts" },
							{ text: "Lab Apps", link: "/LAB" },
							{ text: "Lab App: Audiofabric", link: "/audiofabric" },
							{ text: "Lab App: 4-Track Recorder", link: "/4-track-recorder" },
							{ text: "Collab", link: "/COLLAB" },
							{ text: "i18n Plan", link: "/i18n-plan" },
						],
					},
					{
						text: "🔌 Integrations",
						items: [
							{ text: "FID Identity & Passports", link: "/FID-IDENTITY" },
							{ text: "AI Integrations", link: "/ai-integrations" },
							{ text: "Smart Contracts", link: "/smart-contracts" },
							{ text: "Google Drive", link: "/google-drive" },
							{ text: "Telegram Bot", link: "/telegram" },
						],
					},
					{
						text: "📚 Reference",
						items: [
							{ text: "Project Overview", link: "/project-overview" },
							{ text: "Status & Maturity", link: "/STATUS" },
							{
								text: "Comparison with Funkwhale",
								link: "/comparison-funkwhale",
							},
							{ text: "Performance Audit", link: "/PERFORMANCE-AUDIT" },
							{ text: "Audio Fingerprinting", link: "/audio-fingerprinting" },
							{
								text: "Payments Security Review",
								link: "/security-review-payments",
							},
						],
					},
				],

				footer: {
					message: "Released under the MIT License.",
					copyright: "Copyright © 2026 TuneCamp",
				},

				editLink: {
					pattern: "https://github.com/scobru/tunecamp/edit/main/docs/:path",
					text: "Edit this page on GitHub",
				},
			},
		},
		it: {
			label: "Italiano",
			lang: "it",
			link: "/it/",
			themeConfig: {
				nav: [
					{ text: "Home", link: "/it/" },
					{ text: "Inizia", link: "/it/getting-started" },
					{ text: "Riferimento API", link: "/it/api-contracts" },
					{ text: "Stato", link: "/it/STATUS" },
				],

				sidebar: [
					{
						text: "🚀 Per Iniziare",
						items: [
							{ text: "Avvio Rapido", link: "/it/getting-started" },
							{ text: "Deploy su Railway", link: "/it/railway" },
							{
								text: "Configurazione API e Servizi",
								link: "/it/api-setup-guide",
							},
							{ text: "Nginx", link: "/it/NGINX" },
							{ text: "Backup e Migrazione", link: "/it/backup-migration" },
						],
					},
					{
						text: "🎧 Guida Utente",
						items: [
							{ text: "Ruoli e Permessi", link: "/it/ROLES" },
							{ text: "Sistema Karma (Archiviato)", link: "/it/karma" },
							{ text: "Radio", link: "/it/radio" },
							{ text: "Protocollo Subsonic", link: "/it/subsonic" },
							{ text: "Social e Community", link: "/it/social-features" },
							{
								text: "Diventare Artista e Vendere",
								link: "/it/community-mode",
							},
							{ text: "Pagamenti e Monetizzazione", link: "/it/payments" },
						],
					},
					{
						text: "🛠️ Guida Amministratore",
						items: [
							{ text: "Federazione (ActivityPub)", link: "/it/FEDERATION" },
							{ text: "Peer Sharing", link: "/it/sidecamp" },
							{ text: "Monitoraggio e Allarmi", link: "/it/monitoring" },
							{ text: "Scalabilità", link: "/it/scaling" },
							{ text: "Configurazione MCP", link: "/it/mcp-setup-guide" },
						],
					},
					{
						text: "💻 Guida Sviluppatore",
						items: [
							{
								text: "Decisioni di Architettura",
								link: "/it/ARCHITECTURE-DECISIONS",
							},
							{ text: "Guida allo Sviluppo", link: "/it/development-guide" },
							{ text: "Contribuire", link: "/it/CONTRIBUTING" },
							{
								text: "Backend & Modello Dati",
								link: "/it/architecture-backend",
							},
							{ text: "Architettura Webapp", link: "/it/architecture-webapp" },
							{ text: "Riferimento API", link: "/it/api-contracts" },
							{ text: "Applicazioni Lab", link: "/it/LAB" },
							{ text: "App Lab: Audiofabric", link: "/it/audiofabric" },
							{
								text: "App Lab: Registratore a 4 tracce",
								link: "/it/4-track-recorder",
							},
							{ text: "Collab", link: "/it/COLLAB" },
							{ text: "Piano i18n", link: "/it/i18n-plan" },
						],
					},
					{
						text: "🔌 Integrazioni",
						items: [
							{ text: "Identità FID & Passaporti", link: "/it/FID-IDENTITY" },
							{ text: "Integrazioni AI", link: "/it/ai-integrations" },
							{ text: "Smart Contracts", link: "/it/smart-contracts" },
							{ text: "Google Drive", link: "/it/google-drive" },
							{ text: "Bot Telegram", link: "/it/telegram" },
						],
					},
					{
						text: "📚 Riferimento",
						items: [
							{ text: "Panoramica Progetto", link: "/it/project-overview" },
							{ text: "Stato e Maturità", link: "/it/STATUS" },
							{
								text: "Confronto con Funkwhale",
								link: "/it/comparison-funkwhale",
							},
							{ text: "Audit Prestazioni", link: "/it/PERFORMANCE-AUDIT" },
							{
								text: "Impronte Digitali Audio",
								link: "/it/audio-fingerprinting",
							},
							{
								text: "Revisione Sicurezza Pagamenti",
								link: "/it/security-review-payments",
							},
						],
					},
				],

				footer: {
					message: "Rilasciato sotto licenza MIT.",
					copyright: "Copyright © 2026 TuneCamp",
				},

				editLink: {
					pattern: "https://github.com/scobru/tunecamp/edit/main/docs/:path",
					text: "Modifica questa pagina su GitHub",
				},
			},
		},
	},
});
