
import { MessageSquare, Cpu, Activity, CreditCard, Globe } from 'lucide-react';
import { pluginRegistry } from '../../core/plugins/registry';

// Telegram
pluginRegistry.register({
    id: 'telegram',
    name: 'Telegram Bot',
    icon: <MessageSquare className="text-primary" />,
    description: 'Remote control and notifications via Telegram.',
    statusCheck: (status) => ({
        status: status?.telegram?.active ? 'online' : 'offline',
        details: status?.telegram?.active ? "Bot is online" : "Bot is offline or not configured"
    }),
    configPanel: ({ settings, setSettings }) => (
        <div className="space-y-3 mt-4 border-t border-base-content/10 pt-4">
            <div className="form-control">
                <label className="label text-xs">Bot Token</label>
                <span className="text-sm text-base-content/70">Configured via TUNECAMP_TELEGRAM_BOT_TOKEN environment variable.</span>
            </div>
            <div className="form-control">
                <label className="label text-xs">Allowed Channels (Comma separated)</label>
                <input type="text" className="input input-sm input-bordered" value={settings?.telegram_allowed_channels || ''} onChange={e => setSettings({ ...settings!, telegram_allowed_channels: e.target.value })} />
            </div>
        </div>
    )
});

// OpenRouter
pluginRegistry.register({
    id: 'openrouter',
    name: 'AI (OpenRouter)',
    icon: <Cpu className="text-warning" />,
    description: 'AI-powered metadata enrichment and suggestions.',
    statusCheck: (status) => ({
        status: status?.openrouter?.configured ? 'online' : 'offline',
        details: status?.openrouter?.configured ? `Active: ${status.openrouter.model}` : "API Key missing"
    }),
    configPanel: ({ settings, setSettings }) => (
        <div className="space-y-3 mt-4 border-t border-base-content/10 pt-4">
            <div className="form-control">
                <label className="label text-xs">API Key</label>
                <input type="password" className="input input-sm input-bordered" value={settings?.openrouter_api_key || ''} onChange={e => setSettings({ ...settings!, openrouter_api_key: e.target.value })} />
            </div>
            <div className="form-control">
                <label className="label text-xs">Model Selection</label>
                <select className="select select-sm select-bordered" value={settings?.openrouter_model || ''} onChange={e => setSettings({ ...settings!, openrouter_model: e.target.value })}>
                    <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</option>
                    <option value="anthropic/claude-3-haiku">Claude 3 Haiku</option>
                    <option value="openai/gpt-4o">GPT-4o</option>
                    <option value="openai/gpt-4o-mini">GPT-4o-Mini</option>
                </select>
            </div>
        </div>
    )
});

// Discogs
pluginRegistry.register({
    id: 'discogs',
    name: 'Discogs',
    icon: <Activity className="text-base-content" />,
    description: 'Vinyl-focused metadata and marketplace data.',
    statusCheck: (status) => ({
        status: status?.discogs?.configured ? 'online' : 'offline',
        details: status?.discogs?.configured ? "Token configured" : "Token missing"
    })
});

// Stripe
pluginRegistry.register({
    id: 'stripe',
    name: 'Stripe',
    icon: <CreditCard className="text-[#635BFF]" />,
    description: 'Credit card processing and checkout sessions.',
    statusCheck: (status) => ({
        status: status?.stripe?.configured ? 'online' : 'offline',
        details: status?.stripe?.configured ? (status.stripe.webhookConfigured ? "Ready (Live Webhooks)" : "Keys Set (No Webhook)") : "Not Configured"
    }),
    configPanel: ({ settings, setSettings }) => (
        <div className="space-y-3 mt-4 border-t border-base-content/10 pt-4">
            <div className="form-control">
                <label className="label text-xs">Secret Key</label>
                <input type="password" className="input input-sm input-bordered" value={settings?.stripe_secret_key || ''} onChange={e => setSettings({ ...settings!, stripe_secret_key: e.target.value })} />
            </div>
            <div className="form-control">
                <label className="label text-xs">Webhook Secret</label>
                <input type="password" className="input input-sm input-bordered" value={settings?.stripe_webhook_secret || ''} onChange={e => setSettings({ ...settings!, stripe_webhook_secret: e.target.value })} />
            </div>
        </div>
    )
});

// Google Drive
pluginRegistry.register({
    id: 'gdrive',
    name: 'Google Drive',
    icon: <Globe className="text-blue-500" />,
    description: 'Cloud storage for track localization and backup.',
    statusCheck: (status) => ({
        status: status?.gdrive?.configured && status?.gdrive?.active ? 'online' : 'offline',
        details: status?.gdrive?.configured ? (status.gdrive.active ? "Integration active" : "Service disabled") : "Client ID/Secret missing"
    }),
    configPanel: ({ settings, setSettings }) => (
        <div className="space-y-3 mt-4 border-t border-base-content/10 pt-4">
            <div className="form-control">
                <label className="label text-xs">Client ID</label>
                <input type="text" className="input input-sm input-bordered" value={settings?.google_drive_client_id || ''} onChange={e => setSettings({ ...settings!, google_drive_client_id: e.target.value })} />
            </div>
            <div className="form-control">
                <label className="label text-xs">Client Secret</label>
                <input type="password" className="input input-sm input-bordered" value={settings?.google_drive_client_secret || ''} onChange={e => setSettings({ ...settings!, google_drive_client_secret: e.target.value })} />
            </div>
        </div>
    )
});

// Last.fm
pluginRegistry.register({
    id: 'lastfm',
    name: 'Last.fm',
    icon: <Activity className="text-[#D51007]" />,
    description: 'Music scrobbling and recommendations.',
    statusCheck: (status) => ({
        status: status?.lastfm?.configured ? 'online' : 'offline',
        details: status?.lastfm?.configured ? "Scrobbling active" : "Not configured"
    })
});

// ListenBrainz
pluginRegistry.register({
    id: 'listenbrainz',
    name: 'ListenBrainz',
    icon: <Activity className="text-[#EB743B]" />,
    description: 'Open source music scrobbling service.',
    statusCheck: (status) => ({
        status: status?.listenbrainz?.configured ? 'online' : 'offline',
        details: status?.listenbrainz?.configured ? "Scrobbling active" : "Not configured"
    })
});
