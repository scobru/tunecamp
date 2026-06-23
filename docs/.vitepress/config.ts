import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'TuneCamp',
  description: 'Federated self-hosted music platform for indie artists and labels',
  base: '/tunecamp/',

  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Get Started', link: '/development-guide' },
      { text: 'API Reference', link: '/api-contracts' },
      { text: 'Status', link: '/STATUS' },
    ],

    sidebar: [
      {
        text: 'Project',
        items: [
          { text: 'Project Overview', link: '/project-overview' },
          { text: 'Status & Maturity', link: '/STATUS' },
          { text: 'Source Tree', link: '/source-tree-analysis' },
          { text: 'vs Funkwhale', link: '/comparison-funkwhale' },
        ],
      },
      {
        text: 'Architecture',
        items: [
          { text: 'Backend', link: '/architecture-backend' },
          { text: 'Webapp', link: '/architecture-webapp' },
          { text: 'Data Models', link: '/data-models' },
        ],
      },
      {
        text: 'API & Components',
        items: [
          { text: 'API Contracts', link: '/api-contracts' },
          { text: 'UI Component Inventory', link: '/component-inventory' },
        ],
      },
      {
        text: 'Developer Guide',
        items: [
          { text: 'Development Guide', link: '/development-guide' },
          { text: 'API Configuration', link: '/api-setup-guide' },
          { text: 'Contributing', link: '/CONTRIBUTING' },
        ],
      },
      {
        text: 'Integrations',
        items: [
          { text: 'Payments & Monetization', link: '/payments' },
          { text: 'AI Integrations', link: '/ai-integrations' },
          { text: 'Google Drive', link: '/google-drive' },
          { text: 'Soulseek', link: '/soulseek' },
          { text: 'Torrents', link: '/torrents' },
          { text: 'Telegram Bot', link: '/telegram' },
          { text: 'Smart Contracts', link: '/smart-contracts' },
        ],
      },
      {
        text: 'Features',
        items: [
          { text: 'Federation (ActivityPub)', link: '/FEDERATION' },
          { text: 'Subsonic Protocol', link: '/SUBSONIC' },
          { text: 'Plugins', link: '/PLUGINS' },
          { text: 'Roles & Permissions', link: '/ROLES' },
          { text: 'Social & Community', link: '/social-features' },
          { text: 'Artist & Sales', link: '/community-mode' },
          { text: 'Audio Fingerprinting', link: '/audio-fingerprinting' },
        ],
      },
      {
        text: 'Operations',
        items: [
          { text: 'Nginx', link: '/NGINX' },
          { text: 'Monitoring & Alerting', link: '/monitoring' },
          { text: 'Scaling', link: '/scaling' },
          { text: 'Backup & Migration', link: '/backup-migration' },
          { text: 'Payments Security Review', link: '/security-review-payments' },
        ],
      },
    ],

    socialLinks: [{ icon: 'github', link: 'https://github.com/scobru/tunecamp' }],

    search: { provider: 'local' },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 TuneCamp',
    },

    editLink: {
      pattern: 'https://github.com/scobru/tunecamp/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
  },
})
