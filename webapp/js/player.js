// TuneCamp Audio Player Controller

const Player = {
    audio: null,
    queue: [],
    currentIndex: -1,
    isPlaying: false,
    playRecorded: false,
    isDragging: false, // Flag per tracciare se l'utente sta trascinando la progress bar
    hasDragged: false, // Flag per distinguere tra click e drag

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

        progressBar.addEventListener('mousedown', () => {
            this.isDragging = true;
            this.hasDragged = false;
        });

        progressBar.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                this.hasDragged = true;
            }
        });

        progressBar.addEventListener('mouseup', () => {
            this.isDragging = false;
        });

        // Assicurati che isDragging venga resettato se il mouse esce dalla progress bar
        progressBar.addEventListener('mouseleave', () => {
            if (this.isDragging) {
                this.isDragging = false;
                this.hasDragged = false;
            }
        });

        // Permetti lo scrub anche cliccando direttamente sulla progress bar (solo se non c'è stato drag)
        progressBar.addEventListener('click', (e) => {
            // Se c'è stato un drag, ignora il click (il change handler si occuperà di tutto)
            if (this.hasDragged) {
                this.hasDragged = false;
                return;
            }
            if (this.audio.duration && Number.isFinite(this.audio.duration) && this.audio.duration > 0) {
                const rect = progressBar.getBoundingClientRect();
                const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
                const newTime = (percent / 100) * this.audio.duration;
                if (Number.isFinite(newTime) && newTime >= 0) {
                    this.audio.currentTime = newTime;
                    this.updateProgress();
                }
            }
        });

        // Supporto per dispositivi touch (passive per migliorare le performance)
        progressBar.addEventListener('touchstart', () => {
            this.isDragging = true;
            this.hasDragged = false;
        }, { passive: true });

        progressBar.addEventListener('touchmove', () => {
            if (this.isDragging) {
                this.hasDragged = true;
            }
        }, { passive: true });

        progressBar.addEventListener('touchend', () => {
            this.isDragging = false;
        }, { passive: true });

        progressBar.addEventListener('input', (e) => {
            this.isDragging = true;
            // Aspetta che la durata sia disponibile prima di permettere lo scrub
            if (this.audio.duration && Number.isFinite(this.audio.duration) && this.audio.duration > 0) {
                const newTime = (e.target.value / 100) * this.audio.duration;
                if (Number.isFinite(newTime) && newTime >= 0) {
                    this.audio.currentTime = newTime;
                    // Aggiorna solo il display del tempo durante il trascinamento, non la progress bar
                    const currentTimeEl = document.getElementById('current-time');
                    if (currentTimeEl) {
                        currentTimeEl.textContent = this.formatTime(newTime);
                    }
                }
            } else {
                // Se la durata non è ancora disponibile, forza il caricamento dei metadati
                this.audio.load();
            }
        });

        progressBar.addEventListener('change', (e) => {
            // Quando l'utente rilascia il mouse
            this.isDragging = false;
            if (this.audio.duration && Number.isFinite(this.audio.duration) && this.audio.duration > 0) {
                const newTime = (e.target.value / 100) * this.audio.duration;
                if (Number.isFinite(newTime) && newTime >= 0) {
                    this.audio.currentTime = newTime;
                    // Aggiorna tutto dopo il rilascio
                    this.updateProgress();
                }
            }
            this.hasDragged = false;
        });

        volumeBar.addEventListener('input', (e) => {
            this.audio.volume = e.target.value / 100;
            localStorage.setItem('tunecamp_volume', e.target.value);
        });

        this.audio.addEventListener('timeupdate', () => {
            // Fallback: se isDragging è true da troppo tempo, resettalo
            // (potrebbe essere rimasto bloccato per qualche motivo)
            if (this.isDragging) {
                // Se l'audio sta riproducendo e non c'è input attivo sulla progress bar,
                // probabilmente isDragging è rimasto bloccato
                const progressBar = document.getElementById('progress-bar');
                if (progressBar && document.activeElement !== progressBar) {
                    this.isDragging = false;
                }
            }
            // Aggiorna solo se l'utente non sta trascinando la progress bar
            if (!this.isDragging) {
                this.updateProgress();
            }
        });
        this.audio.addEventListener('loadedmetadata', () => {
            // Aggiorna la durata quando i metadati sono caricati
            this.updateProgress();
        });
        this.audio.addEventListener('durationchange', () => {
            // Aggiorna quando la durata cambia (più affidabile di loadedmetadata)
            this.updateProgress();
        });
        this.audio.addEventListener('canplay', () => {
            // Aggiorna quando l'audio può iniziare a riprodursi
            this.updateProgress();
        });
        this.audio.addEventListener('loadeddata', () => {
            // Aggiorna quando i dati sono caricati
            this.updateProgress();
        });
        this.audio.addEventListener('progress', () => {
            // Aggiorna periodicamente durante il caricamento
            if (!this.isDragging && this.audio.duration && Number.isFinite(this.audio.duration) && this.audio.duration > 0) {
                this.updateProgress();
            }
        });
        this.audio.addEventListener('ended', () => this.next());
        this.audio.addEventListener('play', () => {
            this.updatePlayButton(true);
            // Record play if not yet recorded for this track load
            if (!this.playRecorded && this.queue[this.currentIndex] && !this.queue[this.currentIndex].isExternal) {
                const track = this.queue[this.currentIndex];
                API.recordPlay(track.id).catch(err => console.error('Failed to record play:', err));
                this.playRecorded = true;
            }
        });
        this.audio.addEventListener('pause', () => this.updatePlayButton(false));
        this.audio.addEventListener('error', (e) => this.handleError(e));

        document.getElementById('lyrics-btn').addEventListener('click', () => this.toggleLyrics());
        document.getElementById('queue-btn').addEventListener('click', () => this.toggleQueue());
    },

    handleError(e) {
        console.error('Playback error:', this.audio.error);
        const track = this.queue[this.currentIndex];

        // Dispatch global event
        const event = new CustomEvent('tunecamp:playback-error', {
            detail: {
                track: track,
                error: this.audio.error
            }
        });
        document.dispatchEvent(event);

        this.updatePlayButton(false);
    },

    toggleLyrics() {
        const panel = document.getElementById('lyrics-panel');
        const content = document.getElementById('lyrics-content');

        // Close queue if open
        document.getElementById('queue-panel').style.display = 'none';

        if (panel.style.display === 'none') {
            panel.style.display = 'block';
            if (this.queue[this.currentIndex]) {
                const track = this.queue[this.currentIndex];
                if (track.isExternal) {
                    content.innerHTML = '<p>Lyrics not available for network tracks.</p>';
                    return;
                }

                content.innerHTML = 'Loading...';
                try {
                    API.getLyrics(track.id).then(data => {
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

        // Reset progress bar quando si carica un nuovo brano
        const progressBar = document.getElementById('progress-bar');
        if (progressBar) {
            progressBar.value = 0;
        }
        const currentTimeEl = document.getElementById('current-time');
        if (currentTimeEl) {
            currentTimeEl.textContent = '0:00';
        }
        const totalTimeEl = document.getElementById('total-time');
        if (totalTimeEl) {
            totalTimeEl.textContent = '0:00';
        }

        // Reset audio element per assicurarsi che i metadati vengano ricaricati
        this.audio.pause();
        this.audio.currentTime = 0;

        if (track.isExternal || track.audioUrl) {
            this.audio.src = track.audioUrl;
        } else {
            let format = null;
            // Auto-transcode lossless/heavy formats to MP3 for streaming
            if (track.format && ['wav', 'flac'].includes(track.format.toLowerCase())) {
                format = 'mp3';
            }
            this.audio.src = API.getStreamUrl(track.id, format);
        }

        // Forza il caricamento dei metadati
        this.audio.load();

        document.getElementById('player-title').textContent = track.title;
        document.getElementById('player-artist').textContent = track.artist_name || '';

        const cover = document.getElementById('player-cover');
        const icon = cover.querySelector('.player-cover-icon');

        const coverUrl = track.isExternal ? track.coverUrl : (track.album_id ? API.getAlbumCoverUrl(track.album_id) : null);

        if (coverUrl) {
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
        const current = this.audio.currentTime || 0;
        let duration = this.audio.duration || 0;

        const progressBar = document.getElementById('progress-bar');
        const currentTimeEl = document.getElementById('current-time');
        const totalTimeEl = document.getElementById('total-time');

        // Se la durata non è ancora disponibile, prova a forzare il caricamento
        if ((!duration || !Number.isFinite(duration) || duration <= 0) && this.audio.readyState >= 1) {
            // Se l'audio ha caricato almeno i metadati, la durata dovrebbe essere disponibile
            duration = this.audio.duration || 0;
        }

        // Durante il trascinamento, non aggiornare il valore della progress bar
        // (viene già aggiornato dall'utente), ma aggiorna solo i tempi se necessario
        if (this.isDragging) {
            // Aggiorna solo il tempo totale se non è ancora stato impostato
            if (totalTimeEl && duration && Number.isFinite(duration) && duration > 0) {
                if (!totalTimeEl.textContent || totalTimeEl.textContent === '0:00') {
                    totalTimeEl.textContent = this.formatTime(duration);
                }
            }
            return;
        }

        // Calcola la percentuale solo se la durata è valida
        if (duration && Number.isFinite(duration) && duration > 0) {
            const percent = Math.max(0, Math.min(100, (current / duration) * 100));
            progressBar.value = percent;
        } else {
            // Se la durata non è ancora disponibile, mostra almeno il tempo corrente
            progressBar.value = 0;
        }

        // Aggiorna sempre i tempi (anche se la durata non è disponibile)
        if (currentTimeEl) {
            currentTimeEl.textContent = this.formatTime(current);
        }
        if (totalTimeEl) {
            // Aggiorna il tempo totale solo se la durata è valida
            if (duration && Number.isFinite(duration) && duration > 0) {
                totalTimeEl.textContent = this.formatTime(duration);
            }
        }

        // Forza un reflow per assicurarsi che il browser aggiorni la visualizzazione
        // Questo risolve problemi di sincronizzazione del cursore visivo
        void progressBar.offsetHeight;
    },

    updatePlayButton(playing) {
        const btn = document.getElementById('play-btn');
        btn.textContent = playing ? '⏸' : '▶';
        this.isPlaying = playing;
    },

    formatTime(seconds) {
        if (!seconds || isNaN(seconds) || !Number.isFinite(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return mins + ':' + (secs < 10 ? '0' : '') + secs;
    }
};
