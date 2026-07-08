import React, { useState, useEffect } from 'react';
import { Puzzle } from 'lucide-react';
import { useConfigStore } from '../stores/useConfigStore';
import { pluginRegistry } from '../core/plugins/registry';
import { ExternalProviderSearchTab } from '../components/search/ExternalProviderSearchTab';
import API from '../services/api';

const ContentSearch: React.FC = () => {
    const status = useConfigStore(state => state.status);
    const builtInTabs = pluginRegistry.getSearchTabs(status);

    // External (community) download plugins have no compiled-in frontend:
    // give each enabled one a generic search tab driven by the registry API.
    const [externalTabs, setExternalTabs] = useState<typeof builtInTabs>([]);
    useEffect(() => {
        API.getPluginRegistry().then(registry => {
            const external = (registry.download || []).filter(p => p.isExternal && p.enabled);
            setExternalTabs(external.map(p => ({
                pluginId: p.id,
                id: `external-${p.id}`,
                label: p.name,
                icon: <Puzzle className="mr-2" size={16} />,
                component: () => <ExternalProviderSearchTab providerId={p.id} providerName={p.name} />
            })));
        }).catch(() => setExternalTabs([]));
    }, []);

    const tabs = [...builtInTabs, ...externalTabs];

    // Default to the first available tab if activeTab is not set or invalid
    const [activeTab, setActiveTab] = useState<string>('');

    const activeTabObj = tabs.find(t => t.id === activeTab);
    const ActiveComponent = activeTabObj?.component;

    // Reset to first tab if the activeTab disappears (e.g. plugin disabled)
    useEffect(() => {
        if (!activeTabObj && tabs.length > 0) {
            setActiveTab(tabs[0].id);
        }
    }, [tabs, activeTabObj]);

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <header className="mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold mb-2">Content Search</h1>
                    <p className="text-base-content/60">Find and download music via decentralised protocols.</p>
                </div>
            </header>

            {tabs.length > 0 ? (
                <>
                    <div className="tabs tabs-boxed mb-6 p-1 bg-base-300">
                        {tabs.map(tab => (
                            <button 
                                key={tab.id}
                                className={`tab flex-1 transition-all ${activeTab === tab.id ? 'tab-active shadow-level-1 ' + (tab.colorClass || 'bg-primary text-primary-content') : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                {tab.icon}
                                <span className="ml-2">{tab.label}</span>
                            </button>
                        ))}
                    </div>

                    {ActiveComponent ? <ActiveComponent /> : <div className="text-center opacity-50 py-20">Select a tab</div>}
                </>
            ) : (
                <div className="text-center py-20 opacity-50 bg-base-200/50 rounded-2xl border border-dashed border-base-300">
                    <p className="font-medium">No content search plugins are currently enabled.</p>
                    <p className="text-xs mt-2">Go to Settings to enable Soulseek, Torrent, or Streaming capabilities.</p>
                </div>
            )}
        </div>
    );
};

export default ContentSearch;
