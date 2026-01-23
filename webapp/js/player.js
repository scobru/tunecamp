// TuneCamp Audio Player Controller

const Player = {
    audio: null,
    queue: [],
    currentIndex: -1,
    isPlaying: false,
    playRecorded: false,

    init() {
        this.audio = document.getElementById('audio-element');
        this.setupEvents();
        this.loadVolume();
    },

    setupEvents() {
        const playBtn = document.getElementById('play-btn');
        const prevBtn = document.getElementById('prev-btn');
        const nextBtn = document.getElementById('next-btn');
        const progressBar = document.getElementById('progress-bar');
        const volumeBar = document.getElementById('volume-bar');

        playBtn.addEventListener('click', () => this.togglePlay());
        prevBtn.addEventListener('click', () => this.prev());
        nextBtn.addEventListener('click', () => this.next());

        progressBar.addEventListener('input', (e) => {
            if (this.audio.duration) {
                this.audio.currentTime = (e.target.value / 100) * this.audio.duration;
            }
        });

        volumeBar.addEventListener('input', (e) => {
            this.audio.volume = e.target.value / 100;
            localStorage.setItem('tunecamp_volume', e.target.value);
        });

        this.audio.addEventListener('timeupdate', () => this.updateProgress());
        this.audio.addEventListener('ended', () => this.next());
        this.audio.addEventListener('play', () => {
            this.updatePlayButton(true);
            // Record play if not yet recorded for this track load
            if (!this.playRecorded && this.queue[this.currentIndex]) {
                const track = this.queue[this.currentIndex];
                API.recordPlay(track.id).catch(err => console.error('Failed to record play:', err));
                this.playRecorded = true;
            }
        });
        this.audio.addEventListener('pause', () => this.updatePlayButton(false));

        document.getElementById('lyrics-btn').addEventListener('click', () => this.toggleLyrics());
        document.getElementById('queue-btn').addEventListener('click', () => this.toggleQueue());
    },

    toggleLyrics() {
        const panel = document.getElementById('lyrics-panel');
        const content = document.getElementById('lyrics-content');

        // Close queue if open
        document.getElementById('queue-panel').style.display = 'none';

        if (panel.style.display === 'none') {
            panel.style.display = 'block';
            if (this.queue[this.currentIndex]) {
                content.innerHTML = 'Loading...';
                try {
                    API.getLyrics(this.queue[this.currentIndex].id).then(data => {
                        if (data.lyrics && (Array.isArray(data.lyrics) ? data.lyrics.length > 0 : data.lyrics)) {
                            const text = Array.isArray(data.lyrics)
                                ? data.lyrics.map(l => l.text).join('\n')
                                : data.lyrics;
                            content.innerHTML = `<pre>${App.escapeHtml(text)}</pre>`;
                        } else {
                            content.innerHTML = '<p>No lyrics found for this track.</p>';
                        }
                    }).catch(() => {
                        content.innerHTML = '<p>Failed to load lyrics.</p>';
                    });
                } catch (e) {
                    content.innerHTML = '<p>Failed to load lyrics.</p>';
                }
            } else {
                content.innerHTML = '<p>No track playing.</p>';
            }
        } else {
            panel.style.display = 'none';
        }
    },

    toggleQueue() {
        const panel = document.getElementById('queue-panel');
        const content = document.getElementById('queue-content');

        // Close lyrics if open
        document.getElementById('lyrics-panel').style.display = 'none';

        if (panel.style.display === 'none') {
            panel.style.display = 'block';
            this.renderQueue();
        } else {
            panel.style.display = 'none';
        }
    },

    renderQueue() {
        const content = document.getElementById('queue-content');
        if (!this.queue || this.queue.length === 0) {
            content.innerHTML = '<p>Queue is empty</p>';
            return;
        }

        content.innerHTML = this.queue.map((track, i) => `
            <div class="queue-item ${i === this.currentIndex ? 'active' : ''}" style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px solid var(--border-color);">
                <div style="flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; cursor: pointer;" onclick="Player.playIndex(${i})">
                    <span style="font-weight: bold; margin-right: 5px;">${i + 1}.</span>
                    ${App.escapeHtml(track.title)} - ${App.escapeHtml(track.artist_name || '')}
                </div>
                <div style="display: flex; gap: 5px;">
                   ${i !== this.currentIndex ? `<button class="btn btn-xs btn-ghost" onclick="Player.removeFromQueue(${i})">❌</button>` : ''}
                </div>
            </div>
        `).join('');
    },

    addToQueue(track) {
        this.queue.push(track);
        // If nothing is playing, start playing
        if (this.queue.length === 1 && !this.isPlaying && this.currentIndex === -1) {
            this.play(track, this.queue, 0);
        } else {
            // Update queue view if open
            if (document.getElementById('queue-panel').style.display !== 'none') {
                this.renderQueue();
            }
        }
    },

    removeFromQueue(index) {
        if (index === this.currentIndex) return; // Can't remove current track easily without stop logic
        this.queue.splice(index, 1);
        if (index < this.currentIndex) {
            this.currentIndex--;
        }
        this.renderQueue();
    },

    playIndex(index) {
        if (index >= 0 && index < this.queue.length) {
            this.currentIndex = index;
            this.loadTrack(this.queue[this.currentIndex]);
            this.audio.play();
            this.renderQueue();
        }
    },

    loadVolume() {
        const saved = localStorage.getItem('tunecamp_volume');
        if (saved) {
            document.getElementById('volume-bar').value = saved;
            this.audio.volume = saved / 100;
        }
    },

    play(track, queue, index) {
        this.queue = queue || [track];
        this.currentIndex = index || 0;
        this.loadTrack(track);
        this.audio.play();
    },

    loadTrack(track) {
        this.playRecorded = false;

        let format = null;
        // Auto-transcode lossless/heavy formats to MP3 for streaming
        if (track.format && ['wav', 'flac'].includes(track.format.toLowerCase())) {
            format = 'mp3';
        }

        this.audio.src = API.getStreamUrl(track.id, format);

        document.getElementById('player-title').textContent = track.title;
        document.getElementById('player-artist').textContent = track.artist_name || '';

        const cover = document.getElementById('player-cover');
        const icon = cover.querySelector('.player-cover-icon');
        if (track.album_id) {
            const coverUrl = API.getAlbumCoverUrl(track.album_id);
            const img = new Image();
            img.onload = () => {
                cover.style.backgroundImage = `url(${coverUrl})`;
                cover.style.backgroundSize = 'cover';
                cover.style.backgroundPosition = 'center';
                if (icon) icon.style.display = 'none';
            };
            img.onerror = () => {
                cover.style.backgroundImage = '';
                if (icon) icon.style.display = 'block';
            };
            img.src = coverUrl;
        } else {
            cover.style.backgroundImage = '';
            if (icon) icon.style.display = 'block';
        }
    },

    togglePlay() {
        if (this.audio.paused) {
            this.audio.play();
        } else {
            this.audio.pause();
        }
    },

    prev() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.loadTrack(this.queue[this.currentIndex]);
            this.audio.play();
        }
    },

    next() {
        if (this.currentIndex < this.queue.length - 1) {
            this.currentIndex++;
            this.loadTrack(this.queue[this.currentIndex]);
            this.audio.play();
        }
    },

    updateProgress() {
        const current = this.audio.currentTime;
        const duration = this.audio.duration || 0;

        document.getElementById('progress-bar').value = duration ? (current / duration) * 100 : 0;
        document.getElementById('current-time').textContent = this.formatTime(current);
        document.getElementById('total-time').textContent = this.formatTime(duration);
    },

    updatePlayButton(playing) {
        const btn = document.getElementById('play-btn');
        btn.textContent = playing ? '⏸' : '▶';
        this.isPlaying = playing;
    },

    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return mins + ':' + (secs < 10 ? '0' : '') + secs;
    }
};
