import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'TuneCamp',
  description: 'Federated self-hosted music platform for indie artists and labels',
  base: '/tunecamp/',

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
          { text: 'Subsonic Protocol', link: '/SUBSONIC' },
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
