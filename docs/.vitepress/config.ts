import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'TuneCamp',
  description: 'Federated self-hosted music platform for indie artists and labels',
  base: '/tunecamp/',

  themeConfig: {
    socialLinks: [{ icon: 'github', link: 'https://github.com/scobru/tunecamp' }],
    search: {
      provider: 'local',
      options: {
        locales: {
          it: {
            translations: {
              button: {
                buttonText: 'Cerca',
                buttonAriaLabel: 'Cerca documenti'
              },
              modal: {
                noResultsText: 'Nessun risultato trovato',
                resetButtonTitle: 'Resetta ricerca',
                footer: {
                  selectText: 'per selezionare',
                  navigateText: 'per navigare',
                  closeText: 'per chiudere'
                }
              }
            }
          }
        }
      }
    },
  },

  locales: {
    root: {
      label: 'English',
      lang: 'en',
      themeConfig: {
        nav: [
          { text: 'Home', link: '/' },
          { text: 'Get Started', link: '/getting-started' },
          { text: 'API Reference', link: '/api-contracts' },
          { text: 'Status', link: '/STATUS' },
        ],

        sidebar: [
          {
            text: '🚀 Getting Started',
            items: [
              { text: 'Quick Start', link: '/getting-started' },
              { text: 'API & Services Setup', link: '/api-setup-guide' },
              { text: 'Nginx', link: '/NGINX' },
              { text: 'Backup & Migration', link: '/backup-migration' },
            ],
          },
          {
            text: '🎧 User Guide',
            items: [
              { text: 'Roles & Permissions', link: '/ROLES' },
              { text: 'Radio', link: '/radio' },
              { text: 'Subsonic Protocol', link: '/subsonic' },
              { text: 'Social & Community', link: '/social-features' },
              { text: 'Becoming an Artist & Selling', link: '/community-mode' },
              { text: 'Payments & Monetization', link: '/payments' },
            ],
          },
          {
            text: '🛠️ Administrator Guide',
            items: [
              { text: 'Federation (ActivityPub)', link: '/FEDERATION' },
              { text: 'Plugins', link: '/PLUGINS' },
              { text: 'Peer Sharing', link: '/peer-sharing' },
              { text: 'Monitoring & Alerting', link: '/monitoring' },
              { text: 'Scaling', link: '/scaling' },
              { text: 'MCP Setup', link: '/mcp-setup-guide' },
            ],
          },
          {
            text: '💻 Developer Guide',
            items: [
              { text: 'Development Guide', link: '/development-guide' },
              { text: 'Contributing', link: '/CONTRIBUTING' },
              { text: 'Backend Architecture', link: '/architecture-backend' },
              { text: 'Webapp Architecture', link: '/architecture-webapp' },
              { text: 'Data Models', link: '/data-models' },
              { text: 'API Contracts', link: '/api-contracts' },
              { text: 'UI Component Inventory', link: '/component-inventory' },
              { text: 'Source Tree', link: '/source-tree-analysis' },
              { text: 'Lab Apps', link: '/LAB' },
              { text: 'Lab App: Audiofabric', link: '/audiofabric' },
              { text: 'Lab App: 4-Track Recorder', link: '/4-track-recorder' },
            ],
          },
          {
            text: '🔌 Integrations',
            items: [
              { text: 'AI Integrations', link: '/ai-integrations' },
              { text: 'Smart Contracts', link: '/smart-contracts' },
              { text: 'Google Drive', link: '/google-drive' },
              { text: 'Soulseek', link: '/soulseek' },
              { text: 'Torrents', link: '/torrents' },
              { text: 'Telegram Bot', link: '/telegram' },
            ],
          },
          {
            text: '📚 Reference',
            items: [
              { text: 'Project Overview', link: '/project-overview' },
              { text: 'Status & Maturity', link: '/STATUS' },
              { text: 'Comparison with Funkwhale', link: '/comparison-funkwhale' },
              { text: 'Audio Fingerprinting', link: '/audio-fingerprinting' },
              { text: 'Payments Security Review', link: '/security-review-payments' },
            ],
          },
        ],

        footer: {
          message: 'Released under the MIT License.',
          copyright: 'Copyright © 2026 TuneCamp',
        },

        editLink: {
          pattern: 'https://github.com/scobru/tunecamp/edit/main/docs/:path',
          text: 'Edit this page on GitHub',
        },
      }
    },
    it: {
      label: 'Italiano',
      lang: 'it',
      link: '/it/',
      themeConfig: {
        nav: [
          { text: 'Home', link: '/it/' },
          { text: 'Inizia', link: '/it/getting-started' },
          { text: 'Riferimento API', link: '/it/api-contracts' },
          { text: 'Stato', link: '/it/STATUS' },
        ],

        sidebar: [
          {
            text: '🚀 Per Iniziare',
            items: [
              { text: 'Avvio Rapido', link: '/it/getting-started' },
              { text: 'Configurazione API e Servizi', link: '/it/api-setup-guide' },
              { text: 'Nginx', link: '/it/NGINX' },
              { text: 'Backup e Migrazione', link: '/it/backup-migration' },
            ],
          },
          {
            text: '🎧 Guida Utente',
            items: [
              { text: 'Ruoli e Permessi', link: '/it/ROLES' },
              { text: 'Radio', link: '/it/radio' },
              { text: 'Protocollo Subsonic', link: '/it/subsonic' },
              { text: 'Social e Community', link: '/it/social-features' },
              { text: 'Diventare Artista e Vendere', link: '/it/community-mode' },
              { text: 'Pagamenti e Monetizzazione', link: '/it/payments' },
            ],
          },
          {
            text: '🛠️ Guida Amministratore',
            items: [
              { text: 'Federazione (ActivityPub)', link: '/it/FEDERATION' },
              { text: 'Plugin', link: '/it/PLUGINS' },
              { text: 'Peer Sharing', link: '/it/peer-sharing' },
              { text: 'Monitoraggio e Allarmi', link: '/it/monitoring' },
              { text: 'Scalabilità', link: '/it/scaling' },
              { text: 'Configurazione MCP', link: '/it/mcp-setup-guide' },
            ],
          },
          {
            text: '💻 Guida Sviluppatore',
            items: [
              { text: 'Guida allo Sviluppo', link: '/it/development-guide' },
              { text: 'Contribuire', link: '/it/CONTRIBUTING' },
              { text: 'Architettura Backend', link: '/it/architecture-backend' },
              { text: 'Architettura Webapp', link: '/it/architecture-webapp' },
              { text: 'Modelli Dati', link: '/it/data-models' },
              { text: 'Riferimento API', link: '/it/api-contracts' },
              { text: 'Inventario Componenti UI', link: '/it/component-inventory' },
              { text: 'Analisi Albero Sorgenti', link: '/it/source-tree-analysis' },
              { text: 'Applicazioni Lab', link: '/it/LAB' },
              { text: 'App Lab: Audiofabric', link: '/it/audiofabric' },
              { text: 'App Lab: Registratore a 4 tracce', link: '/it/4-track-recorder' },
            ],
          },
          {
            text: '🔌 Integrazioni',
            items: [
              { text: 'Integrazioni AI', link: '/it/ai-integrations' },
              { text: 'Smart Contracts', link: '/it/smart-contracts' },
              { text: 'Google Drive', link: '/it/google-drive' },
              { text: 'Soulseek', link: '/it/soulseek' },
              { text: 'Torrent', link: '/it/torrents' },
              { text: 'Bot Telegram', link: '/it/telegram' },
            ],
          },
          {
            text: '📚 Riferimento',
            items: [
              { text: 'Panoramica Progetto', link: '/it/project-overview' },
              { text: 'Stato e Maturità', link: '/it/STATUS' },
              { text: 'Confronto con Funkwhale', link: '/it/comparison-funkwhale' },
              { text: 'Impronte Digitali Audio', link: '/it/audio-fingerprinting' },
              { text: 'Revisione Sicurezza Pagamenti', link: '/it/security-review-payments' },
            ],
          },
        ],

        footer: {
          message: 'Rilasciato sotto licenza MIT.',
          copyright: 'Copyright © 2026 TuneCamp',
        },

        editLink: {
          pattern: 'https://github.com/scobru/tunecamp/edit/main/docs/:path',
          text: 'Modifica questa pagina su GitHub',
        },
      }
    }
  }
})

