/**
 * Live Preview Generator for Tunecamp Wizard
 * Generates HTML preview based on wizard data
 */

// Default theme color scheme
const defaultTheme = {
  bg: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
  card: 'rgba(255,255,255,0.05)',
  text: '#f8fafc',
  textMuted: '#94a3b8',
  accent: '#8b5cf6',
  accentGradient: 'linear-gradient(135deg, #8b5cf6, #06b6d4)'
};

/**
 * Generate preview HTML
 */
function generatePreview(data) {
  const theme = defaultTheme;
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Inter', -apple-system, sans-serif;
          background: ${theme.bg};
          color: ${theme.text};
          min-height: 100vh;
          padding: 20px;
        }
        .container { max-width: 600px; margin: 0 auto; }
        .header {
          text-align: center;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 1px solid ${theme.card};
        }
        .header h1 {
          font-size: 1.8rem;
          margin-bottom: 8px;
          background: ${theme.accentGradient};
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .header p { color: ${theme.textMuted}; font-size: 0.9rem; }
        .artist {
          display: flex;
          align-items: center;
          gap: 15px;
          margin-bottom: 30px;
          padding: 15px;
          background: ${theme.card};
          border-radius: 12px;
        }
        .artist-avatar {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: ${theme.accentGradient};
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
        }
        .artist-info h2 { font-size: 1.1rem; margin-bottom: 4px; }
        .artist-info p { color: ${theme.textMuted}; font-size: 0.8rem; }
        .release-card {
          background: ${theme.card};
          border-radius: 12px;
          overflow: hidden;
        }
        .release-cover {
          aspect-ratio: 1;
          background: ${theme.accentGradient};
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 4rem;
        }
        .release-info { padding: 20px; }
        .release-info h3 { font-size: 1.2rem; margin-bottom: 8px; }
        .release-info .meta {
          color: ${theme.textMuted};
          font-size: 0.85rem;
          margin-bottom: 15px;
        }
        .release-info .genres {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .genre-tag {
          padding: 4px 12px;
          background: ${theme.accentGradient};
          border-radius: 20px;
          font-size: 0.75rem;
          color: ${theme.text};
        }
        .track-list { margin-top: 15px; }
        .track {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 0;
          border-bottom: 1px solid ${theme.card};
        }
        .track-num {
          width: 24px;
          color: ${theme.textMuted};
          font-size: 0.8rem;
        }
        .track-title { flex: 1; font-size: 0.9rem; }
        .track-duration { color: ${theme.textMuted}; font-size: 0.8rem; }
        .btn-download {
          display: block;
          width: 100%;
          padding: 12px;
          margin-top: 20px;
          background: ${theme.accentGradient};
          border: none;
          border-radius: 8px;
          color: ${theme.text};
          font-weight: 600;
          text-align: center;
          cursor: pointer;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <header class="header">
          <h1>${escapeHtml(data.catalogTitle || 'My Music')}</h1>
          <p>${escapeHtml(data.catalogDescription || 'Independent music releases')}</p>
        </header>
        
        <div class="artist">
          <div class="artist-avatar">🎵</div>
          <div class="artist-info">
            <h2>${escapeHtml(data.artistName || 'Artist Name')}</h2>
            <p>${escapeHtml(truncate(data.artistBio || 'Music artist', 50))}</p>
          </div>
        </div>
        
        <div class="release-card">
          <div class="release-cover">💿</div>
          <div class="release-info">
            <h3>${escapeHtml(data.releaseTitle || 'Album Title')}</h3>
            <div class="meta">${escapeHtml(data.releaseDate || new Date().toISOString().split('T')[0])}</div>
            <div class="genres">
              ${(data.genres || ['Electronic']).map(g => `<span class="genre-tag">${escapeHtml(g)}</span>`).join('')}
            </div>
            <div class="track-list">
              <div class="track">
                <span class="track-num">1</span>
                <span class="track-title">Example Track One</span>
                <span class="track-duration">3:45</span>
              </div>
              <div class="track">
                <span class="track-num">2</span>
                <span class="track-title">Example Track Two</span>
                <span class="track-duration">4:12</span>
              </div>
              <div class="track">
                <span class="track-num">3</span>
                <span class="track-title">Example Track Three</span>
                <span class="track-duration">5:30</span>
              </div>
            </div>
            <button class="btn-download">
              ${getDownloadButtonText(data.downloadMode, data.price)}
            </button>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Get download button text based on mode
 */
function getDownloadButtonText(mode, price) {
  switch (mode) {
    case 'free':
      return '⬇️ Download Free';
    case 'paycurtain':
      return `💰 Name Your Price (suggested: $${price || 10})`;
    case 'codes':
      return '🔐 Enter Unlock Code';
    case 'none':
      return '🎧 Stream Only';
    default:
      return '⬇️ Download';
  }
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Truncate text
 */
function truncate(text, length) {
  if (text.length <= length) return text;
  return text.substring(0, length) + '...';
}

/**
 * Render preview in iframe
 */
function renderPreview(data) {
  const previewFrame = document.getElementById('preview-frame');
  const html = generatePreview(data);
  
  // Create blob URL for the preview
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  
  // Create or update iframe
  let iframe = previewFrame.querySelector('iframe');
  if (!iframe) {
    iframe = document.createElement('iframe');
    previewFrame.appendChild(iframe);
  }
  
  iframe.src = url;
}

