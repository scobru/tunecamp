import { useEffect, useMemo, useState } from 'react';

type CatalogConfig = {
  title: string;
  description?: string;
  url?: string;
  basePath?: string;
  theme?: string;
  language?: string;
};

type ArtistLink = {
  platform: string;
  url: string;
};

type ArtistConfig = {
  name: string;
  bio?: string;
  photo?: string;
  links?: ArtistLink[];
};

type ReleaseConfig = {
  title: string;
  date: string;
  description?: string;
  download?: 'free' | 'paycurtain' | 'codes' | 'none';
  price?: number;
};

type ReleaseEntry = {
  id: string;
  data: ReleaseConfig | null;
};

type Status = {
  inputDir: string;
  previewDir: string;
  themes: string[];
};

type StepId = 'catalog' | 'artist' | 'releases' | 'theme' | 'preview';

const steps: { id: StepId; label: string }[] = [
  { id: 'catalog', label: 'Catalogo' },
  { id: 'artist', label: 'Artista' },
  { id: 'releases', label: 'Release' },
  { id: 'theme', label: 'Tema' },
  { id: 'preview', label: 'Preview' },
];

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? `Errore API ${response.status}`);
  }
  return (await response.json()) as T;
}

export default function App() {
  const [currentStep, setCurrentStep] = useState<StepId>('catalog');
  const [status, setStatus] = useState<Status | null>(null);
  const [catalog, setCatalog] = useState<CatalogConfig>({
    title: '',
    description: '',
    url: '',
    basePath: '',
    theme: '',
    language: 'en',
  });
  const [artist, setArtist] = useState<ArtistConfig>({
    name: '',
    bio: '',
    photo: '',
    links: [],
  });
  const [releases, setReleases] = useState<ReleaseEntry[]>([]);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(null);
  const [themeOverride, setThemeOverride] = useState<string>('');
  const [basePathOverride, setBasePathOverride] = useState<string>('/preview');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');

  const selectedRelease = useMemo(
    () => releases.find((release) => release.id === selectedReleaseId) ?? null,
    [releases, selectedReleaseId],
  );

  useEffect(() => {
    const load = async () => {
      try {
        const statusPayload = await apiRequest<Status>('/api/status');
        setStatus(statusPayload);
        const catalogPayload = await apiRequest<{ data: CatalogConfig | null }>('/api/catalog');
        if (catalogPayload.data) {
          setCatalog({ ...catalogPayload.data });
          setThemeOverride(catalogPayload.data.theme ?? '');
          setBasePathOverride(catalogPayload.data.basePath ?? '/preview');
        }
        const artistPayload = await apiRequest<{ data: any | null }>('/api/artist');
        if (artistPayload.data) {
          const links = Array.isArray(artistPayload.data.links)
            ? artistPayload.data.links.map((link: Record<string, string>) => {
                const [platform, url] = Object.entries(link)[0] ?? ['', ''];
                return { platform, url };
              })
            : [];
          setArtist({ ...artistPayload.data, links });
        }
        const releasesPayload = await apiRequest<{ releases: ReleaseEntry[] }>('/api/releases');
        setReleases(releasesPayload.releases);
        if (releasesPayload.releases.length > 0) {
          setSelectedReleaseId(releasesPayload.releases[0].id);
        }
      } catch (err: any) {
        setError(err?.message ?? 'Errore nel caricamento iniziale');
      }
    };
    load();
  }, []);

  const handleSaveCatalog = async () => {
    setBusy(true);
    setError('');
    try {
      await apiRequest('/api/catalog', {
        method: 'PUT',
        body: JSON.stringify({ data: catalog }),
      });
      setMessage('Catalogo salvato');
    } catch (err: any) {
      setError(err?.message ?? 'Errore salvataggio catalogo');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveArtist = async () => {
    setBusy(true);
    setError('');
    try {
      const links = (artist.links ?? [])
        .filter((link) => link.platform && link.url)
        .map((link) => ({ [link.platform]: link.url }));
      await apiRequest('/api/artist', {
        method: 'PUT',
        body: JSON.stringify({ data: { ...artist, links } }),
      });
      setMessage('Artista salvato');
    } catch (err: any) {
      setError(err?.message ?? 'Errore salvataggio artista');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveRelease = async () => {
    if (!selectedRelease?.data) return;
    setBusy(true);
    setError('');
    try {
      await apiRequest(`/api/releases/${selectedRelease.id}`, {
        method: 'PUT',
        body: JSON.stringify({ data: selectedRelease.data }),
      });
      setMessage('Release salvata');
    } catch (err: any) {
      setError(err?.message ?? 'Errore salvataggio release');
    } finally {
      setBusy(false);
    }
  };

  const handleAddRelease = async () => {
    setBusy(true);
    setError('');
    try {
      const newRelease: ReleaseConfig = {
        title: 'Nuova Release',
        date: new Date().toISOString().split('T')[0],
        description: '',
        download: 'free',
      };
      const response = await apiRequest<{ id: string }>('/api/releases', {
        method: 'POST',
        body: JSON.stringify({ data: newRelease }),
      });
      const newEntry: ReleaseEntry = { id: response.id, data: newRelease };
      setReleases((prev) => [...prev, newEntry]);
      setSelectedReleaseId(response.id);
      setMessage('Release creata');
    } catch (err: any) {
      setError(err?.message ?? 'Errore creazione release');
    } finally {
      setBusy(false);
    }
  };

  const handlePreviewBuild = async () => {
    setBusy(true);
    setError('');
    try {
      await apiRequest('/api/preview', {
        method: 'POST',
        body: JSON.stringify({ theme: themeOverride || undefined, basePath: basePathOverride || undefined }),
      });
      setMessage('Preview aggiornata');
    } catch (err: any) {
      setError(err?.message ?? 'Errore preview');
    } finally {
      setBusy(false);
    }
  };

  const updateReleaseField = (field: keyof ReleaseConfig, value: string | number) => {
    if (!selectedRelease) return;
    const updatedRelease = {
      ...selectedRelease,
      data: { ...selectedRelease.data, [field]: value },
    };
    setReleases((prev) => prev.map((release) => (release.id === selectedRelease.id ? updatedRelease : release)));
  };

  return (
    <div className="studio">
      <aside className="sidebar">
        <div className="logo">Tunecamp Studio</div>
        <nav className="steps">
          {steps.map((step) => (
            <button
              key={step.id}
              className={currentStep === step.id ? 'step active' : 'step'}
              onClick={() => setCurrentStep(step.id)}
            >
              {step.label}
            </button>
          ))}
        </nav>
        <div className="status">
          <div className="status-row">Catalogo: {status?.inputDir ?? '...'}</div>
          <div className="status-row">Preview: {status?.previewDir ?? '...'}</div>
        </div>
      </aside>

      <main className="content">
        <header className="content-header">
          <h1>{steps.find((step) => step.id === currentStep)?.label}</h1>
          {message && <span className="message">{message}</span>}
          {error && <span className="error">{error}</span>}
        </header>

        {currentStep === 'catalog' && (
          <section className="panel">
            <label>
              Titolo catalogo
              <input
                value={catalog.title ?? ''}
                onChange={(event) => setCatalog({ ...catalog, title: event.target.value })}
              />
            </label>
            <label>
              Descrizione
              <textarea
                value={catalog.description ?? ''}
                onChange={(event) => setCatalog({ ...catalog, description: event.target.value })}
              />
            </label>
            <label>
              URL sito
              <input value={catalog.url ?? ''} onChange={(event) => setCatalog({ ...catalog, url: event.target.value })} />
            </label>
            <label>
              Base path
              <input
                value={catalog.basePath ?? ''}
                onChange={(event) => setCatalog({ ...catalog, basePath: event.target.value })}
              />
            </label>
            <label>
              Lingua
              <input
                value={catalog.language ?? ''}
                onChange={(event) => setCatalog({ ...catalog, language: event.target.value })}
              />
            </label>
            <button disabled={busy} onClick={handleSaveCatalog}>
              Salva catalogo
            </button>
          </section>
        )}

        {currentStep === 'artist' && (
          <section className="panel">
            <label>
              Nome artista
              <input value={artist.name ?? ''} onChange={(event) => setArtist({ ...artist, name: event.target.value })} />
            </label>
            <label>
              Bio
              <textarea value={artist.bio ?? ''} onChange={(event) => setArtist({ ...artist, bio: event.target.value })} />
            </label>
            <label>
              Foto (path)
              <input
                value={artist.photo ?? ''}
                onChange={(event) => setArtist({ ...artist, photo: event.target.value })}
              />
            </label>
            <div className="inline-header">
              <h3>Link</h3>
              <button
                type="button"
                onClick={() =>
                  setArtist((prev) => ({ ...prev, links: [...(prev.links ?? []), { platform: '', url: '' }] }))
                }
              >
                Aggiungi link
              </button>
            </div>
            {(artist.links ?? []).map((link, index) => (
              <div className="row" key={`${link.platform}-${index}`}>
                <input
                  placeholder="platform"
                  value={link.platform}
                  onChange={(event) => {
                    const nextLinks = [...(artist.links ?? [])];
                    nextLinks[index] = { ...link, platform: event.target.value };
                    setArtist({ ...artist, links: nextLinks });
                  }}
                />
                <input
                  placeholder="url"
                  value={link.url}
                  onChange={(event) => {
                    const nextLinks = [...(artist.links ?? [])];
                    nextLinks[index] = { ...link, url: event.target.value };
                    setArtist({ ...artist, links: nextLinks });
                  }}
                />
              </div>
            ))}
            <button disabled={busy} onClick={handleSaveArtist}>
              Salva artista
            </button>
          </section>
        )}

        {currentStep === 'releases' && (
          <section className="panel grid">
            <div className="release-list">
              <div className="inline-header">
                <h3>Releases</h3>
                <button disabled={busy} onClick={handleAddRelease}>
                  Nuova release
                </button>
              </div>
              {releases.map((release) => (
                <button
                  key={release.id}
                  className={selectedReleaseId === release.id ? 'release-item active' : 'release-item'}
                  onClick={() => setSelectedReleaseId(release.id)}
                >
                  {release.data?.title ?? release.id}
                </button>
              ))}
            </div>
            <div className="release-editor">
              {selectedRelease?.data ? (
                <>
                  <label>
                    Titolo
                    <input
                      value={selectedRelease.data.title ?? ''}
                      onChange={(event) => updateReleaseField('title', event.target.value)}
                    />
                  </label>
                  <label>
                    Data
                    <input
                      type="date"
                      value={selectedRelease.data.date ?? ''}
                      onChange={(event) => updateReleaseField('date', event.target.value)}
                    />
                  </label>
                  <label>
                    Descrizione
                    <textarea
                      value={selectedRelease.data.description ?? ''}
                      onChange={(event) => updateReleaseField('description', event.target.value)}
                    />
                  </label>
                  <label>
                    Download
                    <select
                      value={selectedRelease.data.download ?? 'free'}
                      onChange={(event) => updateReleaseField('download', event.target.value)}
                    >
                      <option value="free">free</option>
                      <option value="paycurtain">paycurtain</option>
                      <option value="codes">codes</option>
                      <option value="none">none</option>
                    </select>
                  </label>
                  {selectedRelease.data.download === 'paycurtain' && (
                    <label>
                      Prezzo
                      <input
                        type="number"
                        value={selectedRelease.data.price ?? 0}
                        onChange={(event) => updateReleaseField('price', Number(event.target.value))}
                      />
                    </label>
                  )}
                  <button disabled={busy} onClick={handleSaveRelease}>
                    Salva release
                  </button>
                </>
              ) : (
                <p>Seleziona una release per iniziare.</p>
              )}
            </div>
          </section>
        )}

        {currentStep === 'theme' && (
          <section className="panel">
            <label>
              Tema
              <select value={themeOverride} onChange={(event) => setThemeOverride(event.target.value)}>
                <option value="">Usa catalog.yaml</option>
                {(status?.themes ?? []).map((theme) => (
                  <option key={theme} value={theme}>
                    {theme}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Base path preview
              <input value={basePathOverride} onChange={(event) => setBasePathOverride(event.target.value)} />
            </label>
            <button disabled={busy} onClick={handlePreviewBuild}>
              Rigenera preview
            </button>
          </section>
        )}

        {currentStep === 'preview' && (
          <section className="panel">
            <div className="preview-actions">
              <button disabled={busy} onClick={handlePreviewBuild}>
                Aggiorna preview
              </button>
              <a className="preview-link" href="/preview" target="_blank" rel="noreferrer">
                Apri in nuova scheda
              </a>
            </div>
            <div className="preview-frame">
              <iframe title="Preview Tunecamp" src="/preview" />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

