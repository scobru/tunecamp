# Nginx Configuration Guide for Tunecamp

To run Tunecamp in a production environment, it is highly recommended to use a reverse proxy like Nginx. This allows for SSL/TLS termination (required for ActivityPub federation), better performance for serving static assets, and WebSocket support for Zen.

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

        # WebSocket support (Required for Zen real-time sync)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

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

### 3. Zen WebSockets
If you notice that peers or signaling are not syncing in real-time, double-check that the `Upgrade` and `Connection` headers are correctly set in your `location /` block. These are vital for the Zen peer-to-peer network to function.

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
