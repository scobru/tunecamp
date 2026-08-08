// WebRTC P2P Service for TuneCamp Web Client
// Connects to Sidecamp peers via WebSocket Signaling (@tunecamp/chat) and transfers track data over RTCDataChannel.

import { TuneCampChatClient, type RtcSignalMessage, type ChatStatus } from '@tunecamp/chat';

export interface WebRTCStreamOptions {
  serverUrl: string;
  token?: string;
  targetSessionId: string;
  targetUsername?: string;
  trackId: string;
  timeoutMs?: number;
  chatClient?: TuneCampChatClient;
}

export class WebRTCPeerService {
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private unbindSignal: (() => void) | null = null;

  public async fetchTrackP2P(options: WebRTCStreamOptions): Promise<string> {
    const { serverUrl, token, targetSessionId, targetUsername, trackId, timeoutMs = 4000, chatClient } = options;

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

      // Use active chat client or create temporary instance
      const client = chatClient || new TuneCampChatClient(serverUrl, token);

      const startHandshake = async () => {
        try {
          // 1. Create RTCPeerConnection
          this.pc = new RTCPeerConnection({
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' }
            ]
          });

          // 2. Listen for incoming ICE candidates / SDP answers via @tunecamp/chat
          this.unbindSignal = client.onRtcSignal(async (msg: RtcSignalMessage) => {
            if (!this.pc) return;
            try {
              if (msg.signal?.type === 'answer') {
                await this.pc.setRemoteDescription(new RTCSessionDescription(msg.signal.sdp || msg.signal));
              } else if (msg.signal?.type === 'candidate' && msg.signal.candidate) {
                await this.pc.addIceCandidate(new RTCIceCandidate(msg.signal.candidate));
              }
            } catch (err) {
              console.error("WebRTC signal handling error:", err);
            }
          });

          // 3. Send ICE candidates via @tunecamp/chat
          this.pc.onicecandidate = (event) => {
            if (event.candidate) {
              client.sendRtcSignal(targetUsername || targetSessionId, {
                type: 'candidate',
                candidate: event.candidate
              });
            }
          };

          // 4. Create DataChannel
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
                const blob = new Blob(chunks as BlobPart[], { type: 'audio/mpeg' });
                const blobUrl = URL.createObjectURL(blob);
                finishSuccess(blobUrl);
              } else if (msg.type === 'chunk_error') {
                finishError(new Error(msg.message || 'Error receiving track chunk'));
              }
            } catch (err: any) {
              finishError(err);
            }
          };

          // 5. Create SDP Offer & Send
          const offer = await this.pc.createOffer();
          await this.pc.setLocalDescription(offer);

          client.sendRtcSignal(targetUsername || targetSessionId, {
            type: 'offer',
            sdp: offer
          });

        } catch (err: any) {
          finishError(err);
        }
      };

      if (client.getStatus() === 'online') {
        startHandshake();
      } else {
        const unbindStatus = client.onStatus((status: ChatStatus) => {
          if (status === 'online') {
            unbindStatus();
            startHandshake();
          } else if (status === 'offline') {
            unbindStatus();
            finishError(new Error("Signaling client offline"));
          }
        });
        if (!chatClient) {
          client.connect();
        }
      }
    });
  }

  private cleanup() {
    if (this.unbindSignal) {
      this.unbindSignal();
      this.unbindSignal = null;
    }
    if (this.dataChannel) {
      try { this.dataChannel.close(); } catch {}
      this.dataChannel = null;
    }
    if (this.pc) {
      try { this.pc.close(); } catch {}
      this.pc = null;
    }
  }
}
