# Nginx Configuration Guide for Tunecamp

To run Tunecamp in a production environment, it is highly recommended to use a reverse proxy like Nginx. This allows for SSL/TLS termination (required for ActivityPub federation) and better performance for serving static assets.

## Recommended Nginx Configuration

Below is a standard configuration template. Replace `your-domain.com` with your actual domain and ensure your SSL certificates are correctly pointed.

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Redirect to HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    # SSL Certificates (e.g., via Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # Security Headers
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header X-Frame-Options SAMEORIGIN;

    # Large file uploads (essential for high-quality audio)
    client_max_body_size 500M;

    location / {
        proxy_pass http://localhost:1970; # Default Tunecamp port
        proxy_http_version 1.1;



        # Forward headers for correct IP and protocol detection
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Extended timeouts for large audio streams
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
```

## Critical Post-Setup Steps

### 1. Configure Public URL
Ensure your `TUNECAMP_PUBLIC_URL` environment variable is set to your HTTPS domain:
```bash
TUNECAMP_PUBLIC_URL=https://your-domain.com
```
*Note: ActivityPub federation will not work correctly without a valid HTTPS public URL.*

### 2. Trusting the Proxy
Tunecamp is already configured to trust proxies (via `app.set('trust proxy', true)`), which allows it to correctly identify the original IP of your visitors from the `X-Forwarded-For` header.

> **Important:** the `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` line above is required. Without it, every request appears to come from the proxy's own IP, and per-IP features collapse to a single shared bucket — for example the `POST /api/community/register` rate limit (1 request/hour/IP) would apply globally to all visitors at once.



## Offloading Audio Delivery with X-Accel-Redirect (optional)

By default Node serves every audio byte: it reads the file and pipes it through the
event loop. On a busy instance this makes Node the bottleneck for streaming. You can
hand byte-serving to nginx instead, so Node only does auth + decides *which* file to
serve, while nginx streams it (with full HTTP Range support).

This is **opt-in** and requires matching nginx config — if you enable the app flag
without the `internal` locations below, streaming will break.

### 1. Enable the feature in Tunecamp

```bash
TUNECAMP_XACCEL_REDIRECT=true
# Optional — only change if you also change the nginx locations below:
# TUNECAMP_XACCEL_MEDIA_PREFIX=/_protected_media
# TUNECAMP_XACCEL_CACHE_PREFIX=/_protected_cache
```

When enabled, the app responds to stream requests with an `X-Accel-Redirect` header
pointing at an internal location instead of piping the file.

### 2. Add the internal locations in nginx

Add these **inside the `server { ... }` block** (alongside `location /`). The `alias`
paths must point to your `TUNECAMP_MUSIC_DIR` and your transcode cache directory
(`TUNECAMP_TRANSCODE_CACHE_DIR`, which defaults to `<db-dir>/cache/transcode`):

```nginx
    # Original audio files (maps to TUNECAMP_MUSIC_DIR)
    location /_protected_media/ {
        internal;
        alias /path/to/your/music/;   # trailing slash required
    }

    # Cached transcodes (maps to TUNECAMP_TRANSCODE_CACHE_DIR)
    location /_protected_cache/ {
        internal;
        alias /path/to/your/data/cache/transcode/;   # trailing slash required
    }
```

`internal` means these locations can only be reached via an `X-Accel-Redirect` from
the app — they are never directly accessible to clients, so auth is still enforced by
Tunecamp before the redirect is issued.

> **Note:** This only offloads *local* files. Google Drive, external providers, and
> live (seek) transcodes still stream through Node, which is correct. The transcode
> **cache** (enabled independently) is what makes most transcoded streams eligible
> for offload after the first request.

## CapRover Specific Instructions

If you are deploying Tunecamp via **CapRover**, follow these steps to ensure WebSockets and large uploads work correctly:

1.  Go to the **Apps** tab and select your Tunecamp app.
2.  Click on **Edit Default Nginx Config**.
3.  Ensure the following lines are present inside the `location /` block:
    ```nginx
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_http_version 1.1;
    ```
4.  Increase the **Client Max Body Size** to allow uploading high-quality music:
    ```nginx
    client_max_body_size 512M;
    ```
5.  Increase timeouts for the **Torrent Engine**:
    ```nginx
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;
    ```
6.  Save and Restart the app.
