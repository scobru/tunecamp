// Tunecamp Audio Player

class AudioPlayer {
  constructor() {
    this.audio = new Audio();
    this.currentTrack = 0;
    this.isPlaying = false;
    this.tracks = window.tracks || [];
    
    this.initElements();
    this.attachListeners();
    this.loadTrack(0);
  }
  
  initElements() {
    this.playBtn = document.getElementById('playBtn');
    this.prevBtn = document.getElementById('prevBtn');
    this.nextBtn = document.getElementById('nextBtn');
    this.progressBar = document.getElementById('progressBar');
    this.volumeBar = document.getElementById('volumeBar');
    this.currentTimeEl = document.getElementById('currentTime');
    this.durationEl = document.getElementById('duration');
    this.playerTitle = document.getElementById('playerTitle');
    this.playerArtist = document.getElementById('playerArtist');
  }
  
  attachListeners() {
    // Play/Pause
    if (this.playBtn) {
      this.playBtn.addEventListener('click', () => this.togglePlay());
    }
    
    // Previous track
    if (this.prevBtn) {
      this.prevBtn.addEventListener('click', () => this.previousTrack());
    }
    
    // Next track
    if (this.nextBtn) {
      this.nextBtn.addEventListener('click', () => this.nextTrack());
    }
    
    // Progress bar
    if (this.progressBar) {
      this.progressBar.addEventListener('input', (e) => {
        const time = (this.audio.duration / 100) * e.target.value;
        this.audio.currentTime = time;
      });
    }
    
    // Volume
    if (this.volumeBar) {
      this.volumeBar.addEventListener('input', (e) => {
        this.audio.volume = e.target.value / 100;
      });
      this.audio.volume = this.volumeBar.value / 100;
    }
    
    // Audio events
    this.audio.addEventListener('timeupdate', () => this.updateProgress());
    this.audio.addEventListener('loadedmetadata', () => this.updateDuration());
    this.audio.addEventListener('ended', () => this.nextTrack());
    
    // Track click listeners
    document.querySelectorAll('.track-item').forEach((item, index) => {
      item.addEventListener('click', (e) => {
        if (!e.target.closest('.track-download-btn')) {
          this.playTrack(index);
        }
      });
    });
  }
  
  loadTrack(index) {
    if (!this.tracks[index]) return;
    
    this.currentTrack = index;
    const track = this.tracks[index];
    
    this.audio.src = track.url;
    
    if (this.playerTitle) {
      this.playerTitle.textContent = track.title;
    }
    
    if (this.playerArtist && track.artist) {
      this.playerArtist.textContent = track.artist;
    }
    
    // Update active track in list
    document.querySelectorAll('.track-item').forEach((item, i) => {
      if (i === index) {
        item.classList.add('playing');
      } else {
        item.classList.remove('playing');
      }
    });
  }
  
  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }
  
  play() {
    this.audio.play();
    this.isPlaying = true;
    
    if (this.playBtn) {
      this.playBtn.innerHTML = '<i class="fas fa-pause"></i>';
    }
  }
  
  pause() {
    this.audio.pause();
    this.isPlaying = false;
    
    if (this.playBtn) {
      this.playBtn.innerHTML = '<i class="fas fa-play"></i>';
    }
  }
  
  playTrack(index) {
    this.loadTrack(index);
    this.play();
  }
  
  previousTrack() {
    let prev = this.currentTrack - 1;
    if (prev < 0) {
      prev = this.tracks.length - 1;
    }
    this.playTrack(prev);
  }
  
  nextTrack() {
    let next = this.currentTrack + 1;
    if (next >= this.tracks.length) {
      next = 0;
    }
    this.playTrack(next);
  }
  
  updateProgress() {
    if (!this.audio.duration) return;
    
    const percent = (this.audio.currentTime / this.audio.duration) * 100;
    
    if (this.progressBar) {
      this.progressBar.value = percent;
    }
    
    if (this.currentTimeEl) {
      this.currentTimeEl.textContent = this.formatTime(this.audio.currentTime);
    }
  }
  
  updateDuration() {
    if (this.durationEl) {
      this.durationEl.textContent = this.formatTime(this.audio.duration);
    }
  }
  
  formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}

// Initialize player when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (window.tracks && window.tracks.length > 0) {
      window.player = new AudioPlayer();
    }
  });
} else {
  if (window.tracks && window.tracks.length > 0) {
    window.player = new AudioPlayer();
  }
}

// Global function for track buttons
function playTrack(index) {
  if (window.player) {
    window.player.playTrack(index);
  }
}

// Download all function
function downloadAll() {
  // Call tracking hook if registered (for download stats)
  if (typeof window.onDownloadAll === 'function') {
    try {
      window.onDownloadAll();
    } catch (e) {
      console.warn('Download tracking error:', e);
    }
  }
  
  // Perform the actual downloads
  if (window.tracks) {
    window.tracks.forEach(track => {
      const a = document.createElement('a');
      a.href = track.url;
      a.download = track.title;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
  }
}

