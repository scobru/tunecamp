import './registry'; // Initialize registry

import '../../plugins/soulseek';
import '../../plugins/torrent';
import '../../plugins/youtube';
import '../../plugins/metadata';
import '../../plugins/builtins'; // Contains Telegram, OpenRouter, Discogs, Stripe, GDrive, LastFm, ListenBrainz

export { pluginRegistry, type FrontendPlugin, type PluginConfigProps } from './registry';
