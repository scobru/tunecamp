// WebRTC P2P Service for TuneCamp Web Client
// Connects to Sidecamp peers via WebSocket Signaling (/ws/chat) and transfers track data over RTCDataChannel.

export interface WebRTCStreamOptions {
  serverUrl: string;
  token?: string;
  targetSessionId: string;
  targetUsername?: string;
  trackId: string;
  timeoutMs?: number;
}

export class WebRTCPeerService {
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;

  public async fetchTrackP2P(options: WebRTCStreamOptions): Promise<string> {
    const { serverUrl, token, targetSessionId, targetUsername, trackId, timeoutMs = 4000 } = options;

    return new Promise((resolve, reject) => {
      let isSettled = false;
      const chunks: Uint8Array[] = [];

      // Timeout for WebRTC P2P handshake (fallback trigger)
      const timer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          this.cleanup();
          reject(new Error("WebRTC P2P connection timeout. Fallback to HTTP relay."));
        }
      }, timeoutMs);

      const finishSuccess = (blobUrl: string) => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          this.cleanup();
          resolve(blobUrl);
        }
      };

      const finishError = (err: Error) => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          this.cleanup();
          reject(err);
        }
      };

      // 1. Setup WebSocket for Signaling
      const wsUrl = new URL(serverUrl);
      wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl.pathname = '/ws/chat';
      if (token) wsUrl.searchParams.set('token', token);

      this.ws = new WebSocket(wsUrl.toString());

      this.ws.onopen = async () => {
        try {
          // 2. Create RTCPeerConnection
          this.pc = new RTCPeerConnection({
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' }
            ]
          });

          this.pc.onicecandidate = (event) => {
            if (event.candidate && this.ws?.readyState === WebSocket.OPEN) {
              this.ws.send(JSON.stringify({
                type: 'rtc_signal',
                toSessionId: targetSessionId,
                to: targetUsername,
                signal: { type: 'candidate', candidate: event.candidate }
              }));
            }
          };

          // 3. Create DataChannel
          this.dataChannel = this.pc.createDataChannel('file-transfer');

          this.dataChannel.onopen = () => {
            // Request track over DataChannel
            this.dataChannel?.send(JSON.stringify({
              type: 'request_track',
              trackId
            }));
          };

          this.dataChannel.onmessage = (e) => {
            try {
              const msg = JSON.parse(e.data);
              if (msg.type === 'chunk') {
                const binary = atob(msg.data);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) {
                  bytes[i] = binary.charCodeAt(i);
                }
                chunks.push(bytes);
              } else if (msg.type === 'chunk_end') {
                const blob = new Blob(chunks, { type: 'audio/mpeg' });
                const blobUrl = URL.createObjectURL(blob);
                finishSuccess(blobUrl);
              } else if (msg.type === 'chunk_error') {
                finishError(new Error(msg.message || 'Error receiving track chunk'));
              }
            } catch (err: any) {
              finishError(err);
            }
          };

          // 4. Create SDP Offer
          const offer = await this.pc.createOffer();
          await this.pc.setLocalDescription(offer);

          this.ws.send(JSON.stringify({
            type: 'rtc_signal',
            toSessionId: targetSessionId,
            to: targetUsername,
            signal: { type: 'offer', sdp: offer }
          }));

        } catch (err: any) {
          finishError(err);
        }
      };

      this.ws.onmessage = async (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'rtc_signal' && msg.signal) {
            if (msg.signal.type === 'answer' && this.pc) {
              await this.pc.setRemoteDescription(new RTCSessionDescription(msg.signal.sdp || msg.signal));
            } else if (msg.signal.type === 'candidate' && this.pc) {
              await this.pc.addIceCandidate(new RTCIceCandidate(msg.signal.candidate));
            }
          }
        } catch (err) {
          console.error("Signaling message error:", err);
        }
      };

      this.ws.onerror = (err) => {
        finishError(new Error("WebSocket signaling connection error"));
      };
    });
  }

  private cleanup() {
    if (this.dataChannel) {
      try { this.dataChannel.close(); } catch {}
      this.dataChannel = null;
    }
    if (this.pc) {
      try { this.pc.close(); } catch {}
      this.pc = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
  }
}
