/**
 * Main Wizard Logic for Tunecamp Web Wizard
 * With complete site generation including audio files
 */

// Current step tracking
let currentStep = 1;
const totalSteps = 6;

// Theme is always 'default' now

// Uploaded files
let coverFile = null;
let audioFiles = [];
let audioUrls = []; // URLs for audio files
let audioSourceMode = 'upload'; // 'upload' or 'url'

// Mode: 'new' or 'load'
let wizardMode = 'new';
let loadedSiteData = null; // Data loaded from existing ZIP

// Initialize wizard on page load
document.addEventListener('DOMContentLoaded', () => {
  initWizard();
});

/**
 * Initialize the wizard
 */
function initWizard() {
  // Set default date
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('releaseDate').value = today;
  
  // Setup mode selection (call before other setups)
  setupModeSelection();
  
  // Setup download mode listeners
  setupDownloadModeListeners();
  
  // Setup file upload listeners
  setupFileUploads();
  
  // Setup audio source toggle
  setupAudioSourceToggle();
  
  // Update UI
  updateUI();
}

/**
 * Setup mode selection (new vs load)
 */
function setupModeSelection() {
  // Setup ZIP file upload
  const zipArea = document.getElementById('zip-upload-area');
  const zipInput = document.getElementById('zipFileInput');
  
  if (zipArea && zipInput) {
    zipArea.addEventListener('click', () => zipInput.click());
    
    zipArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      zipArea.classList.add('drag-over');
    });
    
    zipArea.addEventListener('dragleave', () => {
      zipArea.classList.remove('drag-over');
    });
    
    zipArea.addEventListener('drop', (e) => {
      e.preventDefault();
      zipArea.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith('.zip')) {
        handleZipUpload(file);
      }
    });
    
    zipInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        handleZipUpload(file);
      }
    });
  }
}

/**
 * Select wizard mode (new or load)
 */
function selectMode(mode) {
  wizardMode = mode;
  
  // Update UI
  document.getElementById('mode-new').classList.toggle('selected', mode === 'new');
  document.getElementById('mode-load').classList.toggle('selected', mode === 'load');
  document.getElementById('load-zip-area').style.display = mode === 'load' ? 'block' : 'none';
  document.getElementById('features-grid').style.display = mode === 'new' ? 'grid' : 'none';
  
  // Update next button
  updateNextButtonText();
}

/**
 * Handle ZIP file upload
 */
async function handleZipUpload(file) {
  const statusEl = document.getElementById('load-status');
  const lang = translations[currentLanguage];
  
  try {
    statusEl.style.display = 'block';
    statusEl.className = 'load-status';
    statusEl.textContent = lang.welcome.loadingZip;
    
    // Read ZIP file
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const zip = await JSZip.loadAsync(arrayBuffer);
    
    statusEl.textContent = lang.welcome.parsingZip;
    
    // Debug: Log all files in ZIP
    console.log('ZIP contents:', Object.keys(zip.files).filter(k => !zip.files[k].dir).slice(0, 20));
    
    // Try to find YAML files in various locations
    // 1. Root level (standard source structure)
    // 2. In subfolder (if ZIP contains a folder)
    let catalogYaml = zip.file('catalog.yaml');
    let artistYaml = zip.file('artist.yaml');
    
    // If not in root, search in all files (including subfolders)
    if (!catalogYaml || !artistYaml) {
      for (const [path, file] of Object.entries(zip.files)) {
        if (file.dir) continue;
        const fileName = path.split('/').pop();
        if (fileName === 'catalog.yaml' && !catalogYaml) {
          catalogYaml = file;
          console.log('Found catalog.yaml at:', path);
        }
        if (fileName === 'artist.yaml' && !artistYaml) {
          artistYaml = file;
          console.log('Found artist.yaml at:', path);
        }
      }
    }
    
    // If still not found, try common folder structures
    if (!catalogYaml || !artistYaml) {
      // Try common folder names
      const commonFolders = ['artist-free', 'my-music', 'catalog', 'tunecamp'];
      for (const folder of commonFolders) {
        if (!catalogYaml) {
          const path = `${folder}/catalog.yaml`;
          if (zip.file(path)) {
            catalogYaml = zip.file(path);
            console.log('Found catalog.yaml in folder:', folder);
          }
        }
        if (!artistYaml) {
          const path = `${folder}/artist.yaml`;
          if (zip.file(path)) {
            artistYaml = zip.file(path);
            console.log('Found artist.yaml in folder:', folder);
          }
        }
      }
    }
    
    if (catalogYaml || artistYaml) {
      // Parse YAML files
      loadedSiteData = {
        catalog: catalogYaml ? await parseYAML(await catalogYaml.async('text')) : {},
        artist: artistYaml ? await parseYAML(await artistYaml.async('text')) : {},
        releases: []
      };
      
      // Try to find releases - search for release.yaml files
      const releases = [];
      for (const [path, file] of Object.entries(zip.files)) {
        if (file.dir) continue;
        
        // Check if it's a release.yaml file
        if (path.endsWith('release.yaml') && path.includes('releases')) {
          try {
            const releaseData = await parseYAML(await file.async('text'));
            // Extract slug from path: releases/slug-name/release.yaml
            const pathParts = path.split('/').filter(p => p && p !== 'release.yaml');
            const slug = pathParts[pathParts.length - 1] || 'release';
            
            releases.push({
              slug: slug,
              data: releaseData,
              path: path
            });
            console.log('Found release:', slug, 'at', path);
          } catch (e) {
            console.warn('Error parsing release YAML:', path, e);
          }
        }
      }
      loadedSiteData.releases = releases;
      
      // Prefill form fields
      prefillFormFromLoadedData(loadedSiteData);
      
      // Show existing releases info if any found
      if (releases.length > 0) {
        showExistingReleases(releases);
      }
      
      statusEl.className = 'load-status success';
      statusEl.textContent = lang.welcome.zipLoaded + (releases.length > 0 ? ` (${releases.length} release${releases.length > 1 ? 's' : ''} found)` : '');
    } else {
      // No YAML files found - provide helpful error message
      const allFiles = Object.keys(zip.files).filter(k => !zip.files[k].dir).slice(0, 10);
      console.error('Available files in ZIP:', allFiles);
      throw new Error(`No YAML files found in ZIP. Found files: ${allFiles.join(', ')}. Make sure the ZIP contains catalog.yaml and/or artist.yaml files in the root or in a subfolder.`);
    }
  } catch (error) {
    console.error('Error loading ZIP:', error);
    statusEl.className = 'load-status error';
    statusEl.textContent = lang.welcome.zipError;
  }
}

/**
 * Improved YAML parser (handles arrays, nested structures, etc.)
 */
async function parseYAML(yamlText) {
  const result = {};
  const lines = yamlText.split('\n');
  let currentKey = null;
  let currentArray = null;
  let inArray = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    // Check if this is an array item (starts with -)
    if (trimmed.startsWith('-')) {
      const arrayValue = trimmed.substring(1).trim();
      if (currentKey && currentArray) {
        // Extract value from array item
        let value = arrayValue;
        // Check if it's a key-value pair (like links)
        if (value.includes(':')) {
          const colonIdx = value.indexOf(':');
          const subKey = value.substring(0, colonIdx).trim();
          let subValue = value.substring(colonIdx + 1).trim();
          // Remove quotes
          if ((subValue.startsWith('"') && subValue.endsWith('"')) || 
              (subValue.startsWith("'") && subValue.endsWith("'"))) {
            subValue = subValue.slice(1, -1);
          }
          // If currentArray is empty or last item is not an object, create one
          if (currentArray.length === 0 || typeof currentArray[currentArray.length - 1] !== 'object') {
            currentArray.push({});
          }
          const lastItem = currentArray[currentArray.length - 1];
          lastItem[subKey] = subValue;
        } else {
          // Simple array value
          // Remove quotes
          if ((value.startsWith('"') && value.endsWith('"')) || 
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          currentArray.push(value);
        }
      }
      continue;
    }
    
    // Check for key-value pair
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 0) {
      currentKey = trimmed.substring(0, colonIndex).trim();
      let value = trimmed.substring(colonIndex + 1).trim();
      
      // Check if value is empty (might be an array or object starting on next line)
      if (!value) {
        // Check next line to see if it's an array
        if (i + 1 < lines.length && lines[i + 1].trim().startsWith('-')) {
          currentArray = [];
          result[currentKey] = currentArray;
          inArray = true;
          continue;
        }
      }
      
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) || 
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      // Check if it's a number
      if (value && !isNaN(value) && value.trim() !== '') {
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
          result[currentKey] = numValue;
        } else {
          result[currentKey] = value;
        }
      } else {
        result[currentKey] = value;
      }
      
      currentArray = null;
      inArray = false;
    }
  }
  
  return result;
}

/**
 * Prefill form with loaded data
 */
function prefillFormFromLoadedData(data) {
  // Fill catalog fields
  if (data.catalog) {
    if (data.catalog.title) document.getElementById('catalogTitle').value = data.catalog.title;
    if (data.catalog.description) document.getElementById('catalogDescription').value = data.catalog.description;
    if (data.catalog.url) document.getElementById('catalogUrl').value = data.catalog.url;
    // Handle both headerImage and headerImageUrl
    if (data.catalog.headerImage) document.getElementById('headerImageUrl').value = data.catalog.headerImage;
    if (data.catalog.headerImageUrl) document.getElementById('headerImageUrl').value = data.catalog.headerImageUrl;
    // Handle both backgroundImage and backgroundImageUrl
    if (data.catalog.backgroundImage) document.getElementById('backgroundImageUrl').value = data.catalog.backgroundImage;
    if (data.catalog.backgroundImageUrl) document.getElementById('backgroundImageUrl').value = data.catalog.backgroundImageUrl;
  }
  
  // Fill artist fields
  if (data.artist) {
    if (data.artist.name) document.getElementById('artistName').value = data.artist.name;
    if (data.artist.bio) document.getElementById('artistBio').value = data.artist.bio;
    
    // Parse and fill social links
    if (data.artist.links && Array.isArray(data.artist.links)) {
      // Clear existing links (except first row)
      const container = document.getElementById('social-links-container');
      if (container) {
        // Keep first row, remove others
        const rows = container.querySelectorAll('.social-link-row');
        for (let i = 1; i < rows.length; i++) {
          rows[i].remove();
        }
        
        // Fill first row if there's at least one link
        if (data.artist.links.length > 0) {
          const firstRow = rows[0];
          const firstLink = data.artist.links[0];
          if (typeof firstLink === 'object') {
            const platforms = Object.keys(firstLink);
            if (platforms.length > 0) {
              firstRow.querySelector('.social-platform').value = platforms[0];
              firstRow.querySelector('.social-url').value = firstLink[platforms[0]];
            }
          }
          
          // Add additional rows for remaining links
          for (let i = 1; i < data.artist.links.length; i++) {
            const link = data.artist.links[i];
            if (typeof link === 'object') {
              const platforms = Object.keys(link);
              if (platforms.length > 0) {
                addSocialLink();
                const newRows = container.querySelectorAll('.social-link-row');
                const lastRow = newRows[newRows.length - 1];
                lastRow.querySelector('.social-platform').value = platforms[0];
                lastRow.querySelector('.social-url').value = link[platforms[0]];
              }
            }
          }
        }
      }
    }
  }
  
  // Note: Release data is loaded but user can add new releases
  // For now, we keep the form ready for a new release
  // The loaded releases are stored in loadedSiteData.releases and will be included in the generated ZIP
}

/**
 * Show existing releases information
 */
function showExistingReleases(releases) {
  const infoBox = document.getElementById('existing-releases-info');
  const listEl = document.getElementById('existing-releases-list');
  const lang = translations[currentLanguage];
  
  if (!infoBox || !listEl) return;
  
  infoBox.style.display = 'block';
  listEl.innerHTML = '';
  
  releases.forEach((release, index) => {
    const li = document.createElement('li');
    li.textContent = release.data.title || release.slug || `Release ${index + 1}`;
    if (release.data.date) {
      li.textContent += ` (${release.data.date})`;
    }
    listEl.appendChild(li);
  });
  
  // Update labels
  const labelEl = document.getElementById('existing-releases-label');
  const noteEl = document.getElementById('release-mode-note');
  if (labelEl) labelEl.textContent = lang.release.existingReleases + ` (${releases.length})`;
  if (noteEl) noteEl.textContent = currentLanguage === 'it' 
    ? 'Puoi aggiungere una nuova release qui sotto. Le release esistenti verranno incluse nel nuovo ZIP generato.'
    : 'You can add a new release below. Existing releases will be included in the newly generated ZIP.';
}

/**
 * Setup file upload functionality
 */
function setupFileUploads() {
  // Cover upload
  const coverArea = document.getElementById('cover-upload-area');
  const coverInput = document.getElementById('coverFile');
  const coverPreview = document.getElementById('cover-preview');
  const coverPlaceholder = document.getElementById('cover-placeholder');
  
  if (coverArea && coverInput) {
    coverArea.addEventListener('click', () => coverInput.click());
    
    coverArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      coverArea.classList.add('drag-over');
    });
    
    coverArea.addEventListener('dragleave', () => {
      coverArea.classList.remove('drag-over');
    });
    
    coverArea.addEventListener('drop', (e) => {
      e.preventDefault();
      coverArea.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        handleCoverUpload(file);
      }
    });
    
    coverInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        handleCoverUpload(file);
      }
    });
  }
  
  // Audio upload
  const audioArea = document.getElementById('audio-upload-area');
  const audioInput = document.getElementById('audioFiles');
  
  if (audioArea && audioInput) {
    audioArea.addEventListener('click', () => audioInput.click());
    
    audioArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      audioArea.classList.add('drag-over');
    });
    
    audioArea.addEventListener('dragleave', () => {
      audioArea.classList.remove('drag-over');
    });
    
    audioArea.addEventListener('drop', (e) => {
      e.preventDefault();
      audioArea.classList.remove('drag-over');
      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/'));
      if (files.length > 0) {
        handleAudioUpload(files);
      }
    });
    
    audioInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      if (files.length > 0) {
        handleAudioUpload(files);
      }
    });
  }
}

/**
 * Handle cover image upload
 */
function handleCoverUpload(file) {
  coverFile = file;
  
  const coverPreview = document.getElementById('cover-preview');
  const coverPlaceholder = document.getElementById('cover-placeholder');
  
  const reader = new FileReader();
  reader.onload = (e) => {
    coverPreview.src = e.target.result;
    coverPreview.style.display = 'block';
    coverPlaceholder.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

/**
 * Handle audio files upload
 */
function handleAudioUpload(files) {
  // Add new files (avoid duplicates)
  files.forEach(file => {
    if (!audioFiles.find(f => f.name === file.name)) {
      audioFiles.push(file);
    }
  });
  
  // Sort by name
  audioFiles.sort((a, b) => a.name.localeCompare(b.name));
  
  // Render track list
  renderTrackList();
}

/**
 * Render track list preview
 */
function renderTrackList() {
  const container = document.getElementById('track-list-preview');
  if (!container) return;
  
  if (audioFiles.length === 0) {
    container.innerHTML = '';
    return;
  }
  
  container.innerHTML = audioFiles.map((file, index) => `
    <div class="track-item">
      <span class="track-number">${index + 1}</span>
      <span class="track-name">${cleanTrackName(file.name)}</span>
      <span class="track-size">${formatFileSize(file.size)}</span>
      <button class="track-remove" onclick="removeTrack(${index})">×</button>
    </div>
  `).join('');
}

/**
 * Remove a track from the list
 */
function removeTrack(index) {
  audioFiles.splice(index, 1);
  renderTrackList();
}

/**
 * Clean track name (remove extension, numbers at start)
 */
function cleanTrackName(filename) {
  return filename
    .replace(/\.[^/.]+$/, '') // Remove extension
    .replace(/^\d+[-_.\s]*/, '') // Remove leading numbers
    .replace(/[-_]/g, ' ') // Replace dashes/underscores with spaces
    .trim();
}

/**
 * Format file size
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}


/**
 * Setup audio source toggle (Upload vs URL)
 */
function setupAudioSourceToggle() {
  const uploadBtn = document.getElementById('audio-mode-upload');
  const urlBtn = document.getElementById('audio-mode-url');
  const uploadMode = document.getElementById('audio-upload-mode');
  const urlMode = document.getElementById('audio-url-mode');
  const addUrlBtn = document.getElementById('add-audio-url-btn');
  const urlInput = document.getElementById('audioUrlInput');
  
  if (!uploadBtn || !urlBtn) return;
  
  uploadBtn.addEventListener('click', () => {
    audioSourceMode = 'upload';
    uploadBtn.classList.add('active');
    urlBtn.classList.remove('active');
    uploadMode.style.display = 'block';
    urlMode.style.display = 'none';
  });
  
  urlBtn.addEventListener('click', () => {
    audioSourceMode = 'url';
    urlBtn.classList.add('active');
    uploadBtn.classList.remove('active');
    uploadMode.style.display = 'none';
    urlMode.style.display = 'block';
  });
  
  // Add URL button
  if (addUrlBtn && urlInput) {
    addUrlBtn.addEventListener('click', () => {
      const url = urlInput.value.trim();
      if (url && isValidUrl(url)) {
        addAudioUrl(url);
        urlInput.value = '';
      }
    });
    
    // Allow Enter key
    urlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addUrlBtn.click();
      }
    });
  }
}

/**
 * Add an audio URL
 */
function addAudioUrl(url) {
  if (!audioUrls.includes(url)) {
    audioUrls.push(url);
    renderTrackUrlList();
  }
}

/**
 * Remove an audio URL
 */
function removeAudioUrl(index) {
  audioUrls.splice(index, 1);
  renderTrackUrlList();
}

/**
 * Render track URL list
 */
function renderTrackUrlList() {
  const container = document.getElementById('track-url-list-preview');
  if (!container) return;
  
  if (audioUrls.length === 0) {
    container.innerHTML = '';
    return;
  }
  
  container.innerHTML = audioUrls.map((url, index) => {
    const fileName = url.split('/').pop() || `Track ${index + 1}`;
    return `
      <div class="track-item">
        <span class="track-number">${index + 1}</span>
        <span class="track-name">${cleanTrackName(fileName)}</span>
        <span class="track-size">URL</span>
        <button class="track-remove" onclick="removeAudioUrl(${index})">×</button>
      </div>
    `;
  }).join('');
}

/**
 * Validate URL
 */
function isValidUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

/**
 * Setup download mode listeners
 */
function setupDownloadModeListeners() {
  const modeCards = document.querySelectorAll('.download-mode-card');
  const paycurtainOptions = document.getElementById('paycurtain-options');
  
  modeCards.forEach(card => {
    card.addEventListener('click', () => {
      // Update active state
      modeCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      
      // Check the radio
      const radio = card.querySelector('input[type="radio"]');
      radio.checked = true;
      
      // Show/hide paycurtain options
      if (card.dataset.mode === 'paycurtain') {
        paycurtainOptions.style.display = 'block';
      } else {
        paycurtainOptions.style.display = 'none';
      }
    });
  });
}

/**
 * Add a social link row
 */
function addSocialLink() {
  const container = document.getElementById('social-links-container');
  const row = document.createElement('div');
  row.className = 'social-link-row';
  row.innerHTML = `
    <select class="social-platform">
      <option value="">Select platform...</option>
      <option value="website">Website</option>
      <option value="bandcamp">Bandcamp</option>
      <option value="spotify">Spotify</option>
      <option value="soundcloud">SoundCloud</option>
      <option value="youtube">YouTube</option>
      <option value="instagram">Instagram</option>
      <option value="twitter">Twitter/X</option>
    </select>
    <input type="url" class="social-url" placeholder="https://...">
    <button type="button" class="btn-icon remove-social" onclick="removeSocialLink(this)">×</button>
  `;
  container.appendChild(row);
}

/**
 * Remove a social link row
 */
function removeSocialLink(button) {
  const row = button.closest('.social-link-row');
  const container = document.getElementById('social-links-container');
  
  // Don't remove if it's the only row
  if (container.children.length > 1) {
    row.remove();
  } else {
    // Clear the inputs instead
    row.querySelector('select').value = '';
    row.querySelector('input').value = '';
  }
}

/**
 * Go to next step
 */
function nextStep() {
  // Validate current step
  if (!validateStep(currentStep)) {
    return;
  }
  
  if (currentStep < totalSteps) {
    currentStep++;
    updateUI();
  } else if (currentStep === totalSteps) {
    // Generate and show success
    generateCompleteSite();
  }
}

/**
 * Go to previous step
 */
function previousStep() {
  if (currentStep > 1) {
    currentStep--;
    updateUI();
  }
}

/**
 * Validate current step
 */
function validateStep(step) {
  // Step 1: Mode must be selected
  if (step === 1) {
    if (!wizardMode) {
      alert(translations[currentLanguage].welcome.modeSelectError || 'Please select a mode');
      return false;
    }
    if (wizardMode === 'load' && !loadedSiteData) {
      // Allow to proceed even if ZIP not loaded (user can still create new release)
      return true;
    }
    return true;
  }
  switch (step) {
    case 2: // Catalog
      const title = document.getElementById('catalogTitle').value.trim();
      if (!title) {
        alert(currentLanguage === 'it' ? 'Il titolo del catalogo è obbligatorio' : 'Catalog title is required');
        return false;
      }
      break;
    case 3: // Artist
      const artistName = document.getElementById('artistName').value.trim();
      if (!artistName) {
        alert(currentLanguage === 'it' ? 'Il nome artista è obbligatorio' : 'Artist name is required');
        return false;
      }
      break;
    case 4: // Release
      const releaseTitle = document.getElementById('releaseTitle').value.trim();
      if (!releaseTitle) {
        alert(currentLanguage === 'it' ? 'Il titolo della release è obbligatorio' : 'Release title is required');
        return false;
      }
      break;
  }
  return true;
}

/**
 * Update UI based on current step
 */
function updateUI() {
  // Update step visibility
  document.querySelectorAll('.wizard-step').forEach((step, index) => {
    step.classList.remove('active');
    if (index === currentStep - 1) {
      step.classList.add('active');
    }
  });
  
  // Update progress bar
  const progressFill = document.getElementById('progress-fill');
  progressFill.style.width = `${(currentStep / totalSteps) * 100}%`;
  
  // Update progress steps
  document.querySelectorAll('.progress-steps .step').forEach((step, index) => {
    step.classList.remove('active', 'completed');
    if (index < currentStep - 1) {
      step.classList.add('completed');
    } else if (index === currentStep - 1) {
      step.classList.add('active');
    }
  });
  
  // Update back button visibility
  const btnBack = document.getElementById('btn-back');
  btnBack.style.visibility = currentStep > 1 ? 'visible' : 'hidden';
  
  // Update next button text
  updateNextButtonText();
  
  // If on step 1, show/hide features based on mode
  if (currentStep === 1) {
    const featuresGrid = document.getElementById('features-grid');
    if (featuresGrid) {
      featuresGrid.style.display = wizardMode === 'new' ? 'grid' : 'none';
    }
  }
  
  // If on release step and we have loaded data, show existing releases
  if (currentStep === 4 && loadedSiteData && loadedSiteData.releases && loadedSiteData.releases.length > 0) {
    showExistingReleases(loadedSiteData.releases);
  }
  
  // If on summary step, update summaries
  if (currentStep === 6) {
    updateSummary();
    renderPreview(getWizardData());
  }
}

/**
 * Get all wizard data
 */
function getWizardData() {
  // Get social links
  const socialLinks = [];
  document.querySelectorAll('.social-link-row').forEach(row => {
    const platform = row.querySelector('.social-platform').value;
    const url = row.querySelector('.social-url').value;
    if (platform && url) {
      socialLinks.push({ platform, url });
    }
  });
  
  // Get genres
  const genresInput = document.getElementById('releaseGenres').value;
  const genres = genresInput.split(',').map(g => g.trim()).filter(Boolean);
  
  // Get download mode
  const downloadMode = document.querySelector('input[name="downloadMode"]:checked').value;
  
  return {
    catalogTitle: document.getElementById('catalogTitle').value,
    catalogDescription: document.getElementById('catalogDescription').value,
    catalogUrl: document.getElementById('catalogUrl').value,
    headerImageUrl: document.getElementById('headerImageUrl')?.value || '',
    theme: 'default',
    artistName: document.getElementById('artistName').value,
    artistBio: document.getElementById('artistBio').value,
    socialLinks: socialLinks,
    releaseTitle: document.getElementById('releaseTitle').value,
    releaseDate: document.getElementById('releaseDate').value,
    releaseDescription: document.getElementById('releaseDescription').value,
    genres: genres.length > 0 ? genres : ['Electronic'],
    downloadMode: downloadMode,
    price: document.getElementById('price').value,
    paypalLink: document.getElementById('paypalLink').value,
    stripeLink: document.getElementById('stripeLink').value,
    coverFile: coverFile,
    audioFiles: audioFiles,
    audioUrls: audioUrls,
    audioSourceMode: audioSourceMode
  };
}

/**
 * Update summary display
 */
function updateSummary() {
  const data = getWizardData();
  
  // Catalog summary
  document.getElementById('summary-catalog').innerHTML = `
    <p><strong>${data.catalogTitle}</strong></p>
    ${data.catalogUrl ? `<p>URL: ${data.catalogUrl}</p>` : ''}
  `;
  
  // Artist summary
  document.getElementById('summary-artist').innerHTML = `
    <p><strong>${data.artistName}</strong></p>
    ${data.socialLinks.length > 0 ? `<p>${data.socialLinks.length} social links</p>` : ''}
  `;
  
  // Release summary
  const trackCount = data.audioSourceMode === 'upload' ? audioFiles.length : audioUrls.length;
  const trackSource = data.audioSourceMode === 'upload' 
    ? (currentLanguage === 'it' ? 'file caricati' : 'uploaded files')
    : (currentLanguage === 'it' ? 'URL' : 'URLs');
  document.getElementById('summary-release').innerHTML = `
    <p><strong>${data.releaseTitle}</strong></p>
    <p>${data.releaseDate}</p>
    <p>${data.genres.join(', ')}</p>
    <p>${trackCount} ${currentLanguage === 'it' ? 'tracce' : 'tracks'} (${trackSource})</p>
  `;
  
  // Download summary
  const modeNames = {
    free: currentLanguage === 'it' ? 'Gratuito' : 'Free',
    paycurtain: currentLanguage === 'it' ? 'Paga Quanto Vuoi' : 'Pay What You Want',
    codes: currentLanguage === 'it' ? 'Codici Sblocco' : 'Unlock Codes',
    none: currentLanguage === 'it' ? 'Solo Streaming' : 'Streaming Only'
  };
  
  let downloadHtml = `<p><strong>${modeNames[data.downloadMode]}</strong></p>`;
  if (data.downloadMode === 'paycurtain' && data.price) {
    downloadHtml += `<p>$${data.price}</p>`;
  }
  document.getElementById('summary-download').innerHTML = downloadHtml;
}

/**
 * Show building overlay
 */
function showBuildingOverlay(message) {
  let overlay = document.getElementById('building-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'building-overlay';
    overlay.className = 'building-overlay';
    overlay.innerHTML = `
      <div class="building-spinner"></div>
      <div class="building-text" id="building-text"></div>
      <div class="building-progress" id="building-progress"></div>
    `;
    document.body.appendChild(overlay);
  }
  
  document.getElementById('building-text').textContent = message;
  overlay.style.display = 'flex';
}

/**
 * Update building progress
 */
function updateBuildingProgress(text) {
  const progress = document.getElementById('building-progress');
  if (progress) {
    progress.textContent = text;
  }
}

/**
 * Hide building overlay
 */
function hideBuildingOverlay() {
  const overlay = document.getElementById('building-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

/**
 * Generate complete site and show success
 */
async function generateCompleteSite() {
  const lang = translations[currentLanguage];
  
  showBuildingOverlay(lang.building.title);
  
  try {
    // Small delay to show the overlay
    await new Promise(r => setTimeout(r, 100));
    
    updateBuildingProgress(lang.building.processing);
    
    // Generate the complete site
    await buildCompleteSite();
    
    hideBuildingOverlay();
    
    // Show success step
    document.querySelectorAll('.wizard-step').forEach(step => {
      step.classList.remove('active');
      step.style.display = 'none';
    });
    
    const successStep = document.getElementById('step-success');
    successStep.style.display = 'block';
    successStep.classList.add('active');
    
    // Hide footer navigation
    document.querySelector('.wizard-footer').style.display = 'none';
    
    // Update progress to complete
    const progressFill = document.getElementById('progress-fill');
    progressFill.style.width = '100%';
    
    document.querySelectorAll('.progress-steps .step').forEach(step => {
      step.classList.remove('active');
      step.classList.add('completed');
    });
    
    // Show build stats
    showBuildStats();
    
  } catch (error) {
    hideBuildingOverlay();
    console.error('Build error:', error);
    alert('Error building site: ' + error.message);
  }
}

/**
 * Show build statistics
 */
function showBuildStats() {
  const lang = translations[currentLanguage];
  const data = getWizardData();
  
  const totalSize = audioFiles.reduce((sum, f) => sum + f.size, 0) + (coverFile ? coverFile.size : 0);
  
  const statsHtml = `
    <div class="stat-item">
      <span class="stat-value">${data.audioSourceMode === 'upload' ? audioFiles.length : audioUrls.length}</span>
      <span class="stat-label">${lang.success.tracks}</span>
    </div>
    <div class="stat-item">
      <span class="stat-value">1</span>
      <span class="stat-label">release</span>
    </div>
    <div class="stat-item">
      <span class="stat-value">${formatFileSize(totalSize)}</span>
      <span class="stat-label">${lang.success.totalSize}</span>
    </div>
  `;
  
  document.getElementById('build-stats').innerHTML = statsHtml;
}

/**
 * Create slug from text
 */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/**
 * Build complete site with HTML, CSS, JS and audio
 */
async function buildCompleteSite() {
  const data = getWizardData();
  const lang = translations[currentLanguage];
  
  updateBuildingProgress(lang.building.generating);
  
  // Generate all the HTML content
  window.generatedSite = {
    data: data,
    html: {
      index: generateIndexHTML(data),
      release: generateReleaseHTML(data)
    },
    css: generateSiteCSS(data),
    js: generatePlayerJS()
  };
}

/**
 * Download ZIP file with complete site
 */
async function downloadZip() {
  const data = getWizardData();
  const lang = translations[currentLanguage];
  
  showBuildingOverlay(lang.building.packaging);
  
  try {
    const zip = new JSZip();
    
    // Create folder structure
    const releaseSlug = slugify(data.releaseTitle) || 'my-album';
    
    // index.html
    zip.file('index.html', generateIndexHTML(data));
    
    // Release page
    zip.file(`releases/${releaseSlug}/index.html`, generateReleaseHTML(data));
    
    // CSS
    zip.file('assets/style.css', generateSiteCSS(data));
    
    // JS
    zip.file('assets/player.js', generatePlayerJS());
    
    // Cover image
    if (coverFile) {
      const coverExt = coverFile.name.split('.').pop();
      const coverData = await readFileAsArrayBuffer(coverFile);
      zip.file(`releases/${releaseSlug}/cover.${coverExt}`, coverData);
    }
    
    // Audio files (only if uploaded, not if using URLs)
    if (data.audioSourceMode === 'upload' && audioFiles.length > 0) {
      updateBuildingProgress(lang.building.processing + '...');
      for (let i = 0; i < audioFiles.length; i++) {
        const file = audioFiles[i];
        updateBuildingProgress(`${lang.building.processing} (${i + 1}/${audioFiles.length})`);
        const audioData = await readFileAsArrayBuffer(file);
        zip.file(`releases/${releaseSlug}/tracks/${file.name}`, audioData);
      }
    }
    
    updateBuildingProgress(lang.building.packaging);
    
    // Generate and download
    const content = await zip.generateAsync({ type: 'blob' }, (metadata) => {
      updateBuildingProgress(`${lang.building.packaging} ${Math.round(metadata.percent)}%`);
    });
    
    hideBuildingOverlay();
    
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slugify(data.catalogTitle) || 'tunecamp-site'}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
  } catch (error) {
    hideBuildingOverlay();
    console.error('ZIP error:', error);
    alert('Error creating ZIP: ' + error.message);
  }
}

/**
 * Read file as ArrayBuffer
 */
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Generate index.html - Faircamp-inspired layout
 */
function generateIndexHTML(data) {
  const releaseSlug = slugify(data.releaseTitle);
  const coverExt = coverFile ? coverFile.name.split('.').pop() : 'jpg';
  
  // Social links icons mapping
  const socialIcons = {
    website: '🌐',
    bandcamp: '🎵',
    spotify: '🎧',
    soundcloud: '☁️',
    youtube: '📺',
    instagram: '📷',
    twitter: '🐦'
  };
  
  return `<!DOCTYPE html>
<html lang="${currentLanguage}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(data.catalogTitle)}</title>
  <meta name="description" content="${escapeHtml(data.catalogDescription || '')}">
  <meta name="generator" content="Tunecamp">
  <link rel="stylesheet" href="assets/style.css">
  ${data.backgroundImageUrl ? `
  <style>
    body {
      background-image: url('${escapeHtml(data.backgroundImageUrl)}');
      background-size: cover;
      background-position: center;
      background-attachment: fixed;
      background-repeat: no-repeat;
    }
    body::before {
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: var(--bg-color);
      opacity: 0.85;
      z-index: -1;
    }
  </style>
  ` : ''}
</head>
<body class="theme-${data.theme}">
  <!-- Top Navigation Bar -->
  <nav class="top-nav">
    <a href="index.html" class="nav-logo">
      <svg class="logo-icon" viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="45" stroke="currentColor" stroke-width="4"/>
        <circle cx="50" cy="50" r="20" fill="currentColor"/>
        <circle cx="50" cy="50" r="8" fill="var(--bg-color)"/>
      </svg>
      <span>${escapeHtml(data.artistName)}</span>
    </a>
    <div class="nav-links">
      <a href="#releases" class="nav-link">${currentLanguage === 'it' ? 'Catalogo' : 'Browse'}</a>
    </div>
  </nav>

  <!-- Header with background -->
  <header class="site-header">
    ${data.headerImageUrl ? `<div class="header-background" style="background-image: url('${escapeHtml(data.headerImageUrl)}');"></div>` : '<div class="header-background"></div>'}
    <div class="header-content">
      <div class="header-info">
        <h1 class="site-title">${escapeHtml(data.artistName)}</h1>
        ${data.artistBio ? `<p class="site-bio">${escapeHtml(data.artistBio)}</p>` : ''}
        
        <div class="header-actions">
          ${data.socialLinks.length > 0 ? `
            <span class="action-link" title="${currentLanguage === 'it' ? 'Link Social' : 'Social Links'}">···</span>
          ` : ''}
          <button class="action-link" onclick="copyLink()" title="${currentLanguage === 'it' ? 'Copia link' : 'Copy link'}">🔗 ${currentLanguage === 'it' ? 'Copia link' : 'Copy link'}</button>
          <a href="feed.xml" class="action-link" title="RSS Feed">📡 ${currentLanguage === 'it' ? 'Iscriviti' : 'Subscribe'}</a>
        </div>
      </div>
    </div>
  </header>

  <!-- Main Content - Two Column Layout -->
  <main class="main-content">
    <div class="content-wrapper">
      <!-- Releases Grid -->
      <section class="releases-section" id="releases">
        <div class="releases-grid">
          <a href="releases/${releaseSlug}/index.html" class="release-card">
            <div class="release-cover">
              ${coverFile ? `<img src="releases/${releaseSlug}/cover.${coverExt}" alt="${escapeHtml(data.releaseTitle)}" loading="lazy">` : '<div class="cover-placeholder">💿</div>'}
            </div>
            <div class="release-meta">
              <h3 class="release-title">${escapeHtml(data.releaseTitle)}</h3>
              ${data.genres.length > 0 ? `<p class="release-artist">${escapeHtml(data.artistName)}</p>` : ''}
            </div>
          </a>
        </div>
      </section>

      <!-- Sidebar -->
      <aside class="sidebar">
        <div class="sidebar-section artist-card">
          <h2 class="sidebar-title">${escapeHtml(data.artistName)}</h2>
          ${data.artistBio ? `<p class="sidebar-bio">${escapeHtml(data.artistBio)}</p>` : ''}
          
          ${data.socialLinks.length > 0 ? `
            <div class="sidebar-links">
              ${data.socialLinks.map(link => `
                <a href="${escapeHtml(link.url)}" target="_blank" rel="noopener" class="sidebar-link">
                  <span class="link-icon">${socialIcons[link.platform] || '🔗'}</span>
                  <span>${escapeHtml(link.platform)}</span>
                </a>
              `).join('')}
            </div>
          ` : ''}
        </div>
        
        ${data.genres.length > 0 ? `
          <div class="sidebar-section">
            <div class="genre-tags">
              ${data.genres.map(g => `<span class="genre-tag">${escapeHtml(g)}</span>`).join('')}
            </div>
          </div>
        ` : ''}
      </aside>
    </div>
  </main>

  <!-- Footer -->
  <footer class="site-footer">
    <div class="footer-content">
      <p>Powered by <a href="https://github.com/scobru/tunecamp" target="_blank">Tunecamp</a></p>
    </div>
  </footer>

  <script>
    function copyLink() {
      navigator.clipboard.writeText(window.location.href);
      alert('${currentLanguage === 'it' ? 'Link copiato!' : 'Link copied!'}');
    }
  </script>
</body>
</html>`;
}

/**
 * Generate release page HTML - Faircamp-inspired layout
 */
function generateReleaseHTML(data) {
  const releaseSlug = slugify(data.releaseTitle);
  const coverExt = coverFile ? coverFile.name.split('.').pop() : 'jpg';
  
  // Generate track list - support both uploaded files and URLs
  let trackListHTML = '';
  if (data.audioSourceMode === 'url' && data.audioUrls && data.audioUrls.length > 0) {
    // Use URLs
    trackListHTML = data.audioUrls.map((url, index) => {
      const fileName = url.split('/').pop() || `Track ${index + 1}`;
      const trackName = cleanTrackName(fileName);
      return `
        <div class="track-item" data-src="${escapeHtml(url)}" data-is-url="true">
          <div class="track-cover-mini">
            ${coverFile ? `<img src="cover.${coverExt}" alt="">` : '<span>💿</span>'}
          </div>
          <div class="track-info">
            <span class="track-title">${escapeHtml(trackName)}</span>
            <span class="track-artist">${escapeHtml(data.artistName)}</span>
          </div>
          <button class="track-play-btn" onclick="playTrack(${index})">▶</button>
        </div>
      `;
    }).join('');
  } else {
    // Use uploaded files
    trackListHTML = audioFiles.map((file, index) => {
      const trackName = cleanTrackName(file.name);
      return `
        <div class="track-item" data-src="${file.name}" data-is-url="false">
          <div class="track-cover-mini">
            ${coverFile ? `<img src="cover.${coverExt}" alt="">` : '<span>💿</span>'}
          </div>
          <div class="track-info">
            <span class="track-title">${escapeHtml(trackName)}</span>
            <span class="track-artist">${escapeHtml(data.artistName)}</span>
          </div>
          <button class="track-play-btn" onclick="playTrack(${index})">▶</button>
        </div>
      `;
    }).join('');
  }
  
  // Download button based on mode
  let downloadButton = '';
  if (data.downloadMode === 'free') {
    downloadButton = `<button class="btn-download" onclick="downloadAll()">⬇️ ${currentLanguage === 'it' ? 'Download Tutto (Gratis)' : 'Download All (Free)'}</button>`;
  } else if (data.downloadMode === 'paycurtain') {
    downloadButton = `
      <div class="paycurtain-box">
        <p class="pay-prompt">${currentLanguage === 'it' ? 'Supporta l\'artista' : 'Support the artist'}</p>
        <p class="suggested-price">${currentLanguage === 'it' ? 'Prezzo suggerito' : 'Suggested'}: $${data.price || 10}</p>
        <div class="pay-buttons">
          ${data.paypalLink ? `<a href="${escapeHtml(data.paypalLink)}" class="btn-pay paypal" target="_blank">PayPal</a>` : ''}
          ${data.stripeLink ? `<a href="${escapeHtml(data.stripeLink)}" class="btn-pay stripe" target="_blank">Stripe</a>` : ''}
        </div>
        <button class="btn-download-free" onclick="downloadAll()">${currentLanguage === 'it' ? 'o scarica gratis' : 'or download free'}</button>
      </div>
    `;
  } else if (data.downloadMode === 'none') {
    downloadButton = '';
  }
  
  return `<!DOCTYPE html>
<html lang="${currentLanguage}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(data.releaseTitle)} - ${escapeHtml(data.artistName)}</title>
  <meta name="description" content="${escapeHtml(data.releaseDescription || '')}">
  <link rel="stylesheet" href="../../assets/style.css">
  ${data.backgroundImageUrl ? `
  <style>
    body {
      background-image: url('${escapeHtml(data.backgroundImageUrl)}');
      background-size: cover;
      background-position: center;
      background-attachment: fixed;
      background-repeat: no-repeat;
    }
    body::before {
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: var(--bg-color);
      opacity: 0.85;
      z-index: -1;
    }
  </style>
  ` : ''}
</head>
<body class="theme-${data.theme} release-page">
  <!-- Top Navigation Bar -->
  <nav class="top-nav">
    <a href="../../index.html" class="nav-logo">
      <svg class="logo-icon" viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="45" stroke="currentColor" stroke-width="4"/>
        <circle cx="50" cy="50" r="20" fill="currentColor"/>
        <circle cx="50" cy="50" r="8" fill="var(--bg-color)"/>
      </svg>
      <span>${escapeHtml(data.artistName)}</span>
    </a>
    <div class="nav-links">
      <a href="../../index.html" class="nav-link">${currentLanguage === 'it' ? 'Catalogo' : 'Browse'}</a>
    </div>
  </nav>

  <!-- Header with background -->
  <header class="site-header release-header-bg">
    <div class="header-background"></div>
  </header>

  <!-- Release Content -->
  <main class="release-main">
    <div class="release-container">
      <!-- Back link -->
      <a href="../../index.html" class="back-link">← ${currentLanguage === 'it' ? 'Torna al catalogo' : 'Back to catalog'}</a>
      
      <!-- Share Section -->
      <div class="share-section">
        <h3>${currentLanguage === 'it' ? 'Condividi' : 'Share & Embed'}</h3>
        <div class="share-buttons">
          <a href="../../index.html" class="share-btn">📋 ${currentLanguage === 'it' ? 'Catalogo' : 'Catalog'}</a>
          <a href="../../feed.xml" class="share-btn">📡 RSS Feed</a>
          <button class="share-btn" onclick="copyLink()">🔗 ${currentLanguage === 'it' ? 'Copia Link' : 'Copy Link'}</button>
        </div>
      </div>

      <!-- Release Header -->
      <div class="release-header">
        <div class="release-cover-large">
          ${coverFile ? `<img src="cover.${coverExt}" alt="${escapeHtml(data.releaseTitle)}">` : '<div class="cover-placeholder-large">💿</div>'}
        </div>
        <div class="release-info-panel">
          <h1 class="release-title-large">${escapeHtml(data.releaseTitle)}</h1>
          <p class="release-artist-link">by <a href="../../index.html">${escapeHtml(data.artistName)}</a></p>
          <p class="release-date-info">${currentLanguage === 'it' ? 'Pubblicato il' : 'Released'} ${data.releaseDate}</p>
          
          ${data.genres.length > 0 ? `
            <div class="release-genres">
              ${data.genres.map(g => `<span class="genre-tag">${escapeHtml(g)}</span>`).join('')}
            </div>
          ` : ''}
          
          ${data.releaseDescription ? `<p class="release-description">${escapeHtml(data.releaseDescription)}</p>` : ''}
          
          ${downloadButton}
        </div>
      </div>

      <!-- Tracks Section -->
      <section class="tracks-section">
        <h2>${currentLanguage === 'it' ? 'Tracce' : 'Tracks'}</h2>
        
        <div class="track-list">
          ${trackListHTML}
        </div>

        <!-- Player Controls -->
        <div class="player-controls-bar">
          <audio id="audio-player" preload="metadata"></audio>
          <div class="player-row">
            <button class="player-btn" onclick="prevTrack()">⏮</button>
            <button class="player-btn play-btn" id="btn-play" onclick="togglePlay()">▶</button>
            <button class="player-btn" onclick="nextTrack()">⏭</button>
          </div>
          <div class="progress-row">
            <span id="current-time">0:00</span>
            <input type="range" id="progress-bar" value="0" min="0" max="100" class="progress-slider">
            <span id="duration">0:00</span>
          </div>
        </div>
      </section>
    </div>
  </main>

  <!-- Footer -->
  <footer class="site-footer">
    <div class="footer-content">
      <p>Powered by <a href="https://github.com/scobru/tunecamp" target="_blank">Tunecamp</a></p>
    </div>
  </footer>

  <script>
    function copyLink() {
      navigator.clipboard.writeText(window.location.href);
      alert('${currentLanguage === 'it' ? 'Link copiato!' : 'Link copied!'}');
    }
  </script>
  <script src="../../assets/player.js"></script>
</body>
</html>`;
}

/**
 * Generate site CSS - Faircamp-inspired (default theme only)
 */
function generateSiteCSS(data) {
  return `
/* Tunecamp Generated Styles - Faircamp Inspired */
:root {
  --bg-color: #1e2128;
  --bg-secondary: #282c34;
  --bg-card: rgba(255,255,255,0.05);
  --text-color: #b8c0cc;
  --text-muted: #6b7280;
  --accent: #5eadb0;
  --accent-hover: #7bc5c8;
  --border-color: #374151;
  --header-bg: linear-gradient(180deg, rgba(30,33,40,0.95) 0%, rgba(30,33,40,0.8) 100%);
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg-color);
  color: var(--text-color);
  line-height: 1.6;
  min-height: 100vh;
}

a { color: var(--accent); text-decoration: none; }
a:hover { color: var(--accent-hover); }

/* Top Navigation - Faircamp style */
.top-nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1.5rem;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.nav-logo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-color);
  font-weight: 500;
  font-size: 0.9rem;
}

.logo-icon {
  width: 20px;
  height: 20px;
  color: var(--accent);
}

.nav-links {
  display: flex;
  gap: 1rem;
}

.nav-link {
  color: var(--text-muted);
  font-size: 0.9rem;
  padding: 0.25rem 0.5rem;
}

.nav-link:hover {
  color: var(--text-color);
}

/* Header with Background */
.site-header {
  position: relative;
  min-height: 200px;
  padding-top: 60px;
  background: var(--header-bg);
  overflow: hidden;
}

.header-background {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg-color) 100%);
  opacity: 0.5;
}

.header-content {
  position: relative;
  z-index: 1;
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.header-info {
  max-width: 600px;
}

.site-title {
  font-size: 2rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  color: var(--text-color);
}

.site-bio {
  color: var(--text-muted);
  font-size: 0.95rem;
  line-height: 1.7;
  margin-bottom: 1rem;
}

.header-actions {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  margin-top: 1rem;
}

.action-link {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--accent);
  font-size: 0.85rem;
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;
}

.action-link:hover {
  color: var(--accent-hover);
}

/* Main Content - Two Column */
.main-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.content-wrapper {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 3rem;
}

/* Releases Grid */
.releases-section {
  min-width: 0;
}

.releases-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 1.5rem;
}

.release-card {
  display: block;
  text-decoration: none;
  color: inherit;
  transition: transform 0.2s;
}

.release-card:hover {
  transform: translateY(-4px);
}

.release-card:hover .release-cover img {
  transform: scale(1.05);
}

.release-cover {
  aspect-ratio: 1;
  border-radius: 4px;
  overflow: hidden;
  background: var(--bg-card);
  margin-bottom: 0.75rem;
}

.release-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s;
}

.cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-card);
  font-size: 3rem;
}

.release-meta {
  padding: 0;
}

.release-title {
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--text-color);
  margin-bottom: 0.25rem;
  line-height: 1.3;
}

.release-artist {
  font-size: 0.85rem;
  color: var(--text-muted);
}

/* Sidebar */
.sidebar {
  min-width: 0;
}

.sidebar-section {
  margin-bottom: 2rem;
}

.sidebar-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  color: var(--text-color);
}

.sidebar-bio {
  color: var(--text-muted);
  font-size: 0.9rem;
  line-height: 1.6;
  margin-bottom: 1rem;
}

.sidebar-links {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.sidebar-link {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--accent);
  font-size: 0.9rem;
  padding: 0.25rem 0;
}

.link-icon {
  font-size: 1rem;
}

.genre-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.genre-tag {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.8rem;
  color: var(--text-muted);
}

/* Release Page Specific */
.release-page {
  padding-top: 50px;
}

.release-header-bg {
  min-height: 120px;
}

.release-main {
  max-width: 1000px;
  margin: 0 auto;
  padding: 2rem;
}

.release-container {
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 2rem;
}

.back-link {
  display: inline-block;
  color: var(--accent);
  font-size: 0.9rem;
  margin-bottom: 1.5rem;
}

.share-section {
  background: var(--bg-card);
  border-radius: 8px;
  padding: 1.25rem;
  margin-bottom: 2rem;
}

.share-section h3 {
  font-size: 0.9rem;
  color: var(--text-muted);
  margin-bottom: 0.75rem;
}

.share-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.share-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem 0.75rem;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-color);
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}

.share-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

/* Release Header */
.release-header {
  display: grid;
  grid-template-columns: 250px 1fr;
  gap: 2rem;
  margin-bottom: 2rem;
}

.release-cover-large {
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 8px 30px rgba(0,0,0,0.3);
}

.release-cover-large img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-placeholder-large {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-card);
  font-size: 5rem;
}

.release-info-panel {
  display: flex;
  flex-direction: column;
}

.release-title-large {
  font-size: 1.75rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--text-color);
}

.release-artist-link {
  font-size: 1rem;
  color: var(--text-muted);
  margin-bottom: 0.5rem;
}

.release-artist-link a {
  color: var(--accent);
}

.release-date-info {
  font-size: 0.9rem;
  color: var(--text-muted);
  margin-bottom: 1rem;
}

.release-genres {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.release-description {
  color: var(--text-muted);
  font-size: 0.9rem;
  line-height: 1.6;
  margin-bottom: 1.5rem;
}

/* Download Button */
.btn-download {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  background: var(--accent);
  color: var(--bg-color);
  border: none;
  border-radius: 6px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-download:hover {
  background: var(--accent-hover);
  transform: translateY(-2px);
}

/* Paycurtain */
.paycurtain-box {
  background: var(--bg-card);
  border-radius: 8px;
  padding: 1.5rem;
  text-align: center;
}

.pay-prompt {
  font-size: 0.9rem;
  color: var(--text-muted);
  margin-bottom: 0.25rem;
}

.suggested-price {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 1rem;
}

.pay-buttons {
  display: flex;
  justify-content: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.btn-pay {
  padding: 0.75rem 1.25rem;
  background: var(--accent);
  color: var(--bg-color);
  border-radius: 6px;
  font-weight: 600;
  transition: all 0.2s;
}

.btn-pay:hover {
  background: var(--accent-hover);
}

.btn-download-free {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 0.85rem;
  cursor: pointer;
  text-decoration: underline;
}

/* Tracks Section */
.tracks-section h2 {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 1rem;
  color: var(--text-color);
}

.track-list {
  margin-bottom: 1.5rem;
}

.track-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem;
  background: var(--bg-card);
  border-radius: 8px;
  margin-bottom: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
}

.track-item:hover {
  background: var(--border-color);
}

.track-item.playing {
  background: var(--border-color);
}

.track-cover-mini {
  width: 48px;
  height: 48px;
  border-radius: 4px;
  overflow: hidden;
  flex-shrink: 0;
}

.track-cover-mini img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.track-info {
  flex: 1;
  min-width: 0;
}

.track-info .track-title {
  display: block;
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-info .track-artist {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.track-play-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--accent);
  color: var(--bg-color);
  border: none;
  cursor: pointer;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}

.track-play-btn:hover {
  background: var(--accent-hover);
  transform: scale(1.1);
}

/* Player Controls Bar */
.player-controls-bar {
  background: var(--bg-card);
  border-radius: 8px;
  padding: 1rem 1.5rem;
}

.player-row {
  display: flex;
  justify-content: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.player-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--border-color);
  color: var(--text-color);
  border: none;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.2s;
}

.player-btn.play-btn {
  width: 50px;
  height: 50px;
  background: var(--accent);
  color: var(--bg-color);
}

.player-btn:hover {
  transform: scale(1.1);
}

.progress-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.progress-slider {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  background: var(--border-color);
  border-radius: 2px;
  cursor: pointer;
}

.progress-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  background: var(--accent);
  border-radius: 50%;
  cursor: pointer;
}

/* Footer */
.site-footer {
  text-align: center;
  padding: 2rem;
  color: var(--text-muted);
  font-size: 0.85rem;
  border-top: 1px solid var(--border-color);
  margin-top: 3rem;
}

/* Responsive */
@media (max-width: 900px) {
  .content-wrapper {
    grid-template-columns: 1fr;
  }
  
  .sidebar {
    order: -1;
    display: flex;
    flex-wrap: wrap;
    gap: 2rem;
  }
  
  .sidebar-section {
    flex: 1;
    min-width: 200px;
    margin-bottom: 0;
  }
}

@media (max-width: 600px) {
  .top-nav {
    padding: 0.5rem 1rem;
  }
  
  .site-header {
    min-height: 150px;
  }
  
  .header-content {
    padding: 1rem;
  }
  
  .site-title {
    font-size: 1.5rem;
  }
  
  .releases-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
  }
  
  .release-header {
    grid-template-columns: 1fr;
  }
  
  .release-cover-large {
    max-width: 250px;
    margin: 0 auto;
  }
  
  .release-info-panel {
    text-align: center;
  }
  
  .release-genres {
    justify-content: center;
  }
  
  .paycurtain-box,
  .btn-download {
    width: 100%;
  }
}
`;
}

/**
 * Generate player JavaScript
 */
function generatePlayerJS() {
  return `
// Tunecamp Audio Player
const audio = document.getElementById('audio-player');
const tracks = document.querySelectorAll('.track-item');
const playBtn = document.getElementById('btn-play');
const progressBar = document.getElementById('progress-bar');
const currentTimeEl = document.getElementById('current-time');
const durationEl = document.getElementById('duration');

let currentTrackIndex = -1;
let isPlaying = false;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Track click handlers
  tracks.forEach((track, index) => {
    track.addEventListener('click', (e) => {
      // Don't trigger if clicking the play button directly
      if (e.target.classList.contains('track-play-btn')) return;
      playTrack(index);
    });
  });
});

function playTrack(index) {
  loadTrack(index);
  play();
}

function loadTrack(index) {
  if (index < 0 || index >= tracks.length) return;
  
  // Update UI
  tracks.forEach(t => t.classList.remove('playing'));
  tracks[index].classList.add('playing');
  
  // Update play buttons
  tracks.forEach(t => {
    const btn = t.querySelector('.track-play-btn');
    if (btn) btn.textContent = '▶';
  });
  const currentBtn = tracks[index].querySelector('.track-play-btn');
  if (currentBtn) currentBtn.textContent = '⏸';
  
  // Load audio - handle both URLs and local files
  const trackElement = tracks[index];
  const isUrl = trackElement.dataset.isUrl === 'true';
  const src = isUrl 
    ? trackElement.dataset.src  // Use URL directly
    : \`tracks/\${trackElement.dataset.src}\`;  // Local file path
  audio.src = src;
  currentTrackIndex = index;
}

function play() {
  if (currentTrackIndex === -1 && tracks.length > 0) {
    loadTrack(0);
  }
  audio.play();
  isPlaying = true;
  if (playBtn) playBtn.textContent = '⏸';
  
  // Update track button
  if (currentTrackIndex >= 0) {
    const btn = tracks[currentTrackIndex].querySelector('.track-play-btn');
    if (btn) btn.textContent = '⏸';
  }
}

function pause() {
  audio.pause();
  isPlaying = false;
  if (playBtn) playBtn.textContent = '▶';
  
  // Update track button
  if (currentTrackIndex >= 0) {
    const btn = tracks[currentTrackIndex].querySelector('.track-play-btn');
    if (btn) btn.textContent = '▶';
  }
}

function togglePlay() {
  if (isPlaying) {
    pause();
  } else {
    play();
  }
}

function nextTrack() {
  const next = (currentTrackIndex + 1) % tracks.length;
  loadTrack(next);
  if (isPlaying) play();
}

function prevTrack() {
  const prev = currentTrackIndex <= 0 ? tracks.length - 1 : currentTrackIndex - 1;
  loadTrack(prev);
  if (isPlaying) play();
}

// Audio events
if (audio) {
  audio.addEventListener('timeupdate', () => {
    if (audio.duration) {
      const progress = (audio.currentTime / audio.duration) * 100;
      if (progressBar) progressBar.value = progress;
      if (currentTimeEl) currentTimeEl.textContent = formatTime(audio.currentTime);
    }
  });

  audio.addEventListener('loadedmetadata', () => {
    if (durationEl) durationEl.textContent = formatTime(audio.duration);
  });

  audio.addEventListener('ended', () => {
    nextTrack();
  });

  audio.addEventListener('play', () => {
    isPlaying = true;
    if (playBtn) playBtn.textContent = '⏸';
  });

  audio.addEventListener('pause', () => {
    isPlaying = false;
    if (playBtn) playBtn.textContent = '▶';
  });
}

// Progress bar seek
if (progressBar) {
  progressBar.addEventListener('input', () => {
    if (audio && audio.duration) {
      audio.currentTime = (progressBar.value / 100) * audio.duration;
    }
  });
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return mins + ':' + (secs < 10 ? '0' : '') + secs;
}

// Download functions
function downloadAll() {
  tracks.forEach((track, index) => {
    setTimeout(() => {
      const src = track.dataset.src;
      const a = document.createElement('a');
      a.href = src;
      a.download = src;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }, index * 500); // Stagger downloads
  });
}

function downloadTrack(src) {
  const a = document.createElement('a');
  a.href = src;
  a.download = src;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
`;
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

/**
 * Generate catalog.yaml
 */
function generateCatalogYAML(data) {
  let yaml = `title: "${escapeYAMLString(data.catalogTitle)}"\n`;
  if (data.catalogDescription) {
    yaml += `description: "${escapeYAMLString(data.catalogDescription)}"\n`;
  }
  if (data.catalogUrl) {
    yaml += `url: "${escapeYAMLString(data.catalogUrl)}"\n`;
  }
  if (data.headerImageUrl) {
    yaml += `headerImage: "${escapeYAMLString(data.headerImageUrl)}"\n`;
  }
  if (data.backgroundImageUrl) {
    yaml += `backgroundImage: "${escapeYAMLString(data.backgroundImageUrl)}"\n`;
  }
  yaml += `theme: "default"\n`;
  return yaml;
}

/**
 * Generate artist.yaml
 */
function generateArtistYAML(data) {
  let yaml = `name: "${escapeYAMLString(data.artistName)}"\n`;
  if (data.artistBio) {
    yaml += `bio: "${escapeYAMLString(data.artistBio)}"\n`;
  }
  if (data.socialLinks && data.socialLinks.length > 0) {
    yaml += `links:\n`;
    for (const link of data.socialLinks) {
      if (link.platform && link.url) {
        yaml += `  - ${link.platform}: "${escapeYAMLString(link.url)}"\n`;
      }
    }
  }
  return yaml;
}

/**
 * Generate release.yaml
 */
function generateReleaseYAML(data, releaseSlug) {
  let yaml = `title: "${escapeYAMLString(data.releaseTitle)}"\n`;
  yaml += `date: "${data.releaseDate}"\n`;
  if (data.releaseDescription) {
    yaml += `description: "${escapeYAMLString(data.releaseDescription)}"\n`;
  }
  if (data.genres && data.genres.length > 0) {
    yaml += `genres:\n`;
    for (const genre of data.genres) {
      yaml += `  - "${escapeYAMLString(genre)}"\n`;
    }
  }
  yaml += `download: "${data.downloadMode}"\n`;
  if (data.downloadMode === 'paycurtain' && data.price) {
    yaml += `price: ${data.price}\n`;
    if (data.paypalLink) {
      yaml += `paypalLink: "${escapeYAMLString(data.paypalLink)}"\n`;
    }
    if (data.stripeLink) {
      yaml += `stripeLink: "${escapeYAMLString(data.stripeLink)}"\n`;
    }
  }
  return yaml;
}

/**
 * Generate release YAML from existing data
 */
function generateReleaseYAMLFromData(data) {
  let yaml = '';
  for (const [key, value] of Object.entries(data)) {
    if (value !== null && value !== undefined) {
      if (Array.isArray(value)) {
        yaml += `${key}:\n`;
        for (const item of value) {
          yaml += `  - "${escapeYAMLString(String(item))}"\n`;
        }
      } else if (typeof value === 'object') {
        // Skip complex objects for now
      } else {
        yaml += `${key}: "${escapeYAMLString(String(value))}"\n`;
      }
    }
  }
  return yaml;
}

/**
 * Escape string for YAML
 */
function escapeYAMLString(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}
