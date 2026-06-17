# Monitoring & Alerting

Tunecamp ships with two monitoring hooks: an HTTP health endpoint and optional
Sentry crash reporting. Together with an external uptime check they cover the
two questions that matter in production: *"is the instance up?"* and
*"what broke?"*.

## Health endpoint

`GET /health` returns `200` when the HTTP server is responsive. It is
registered before the federation middleware, so a stuck integration cannot
block it. The Docker image already uses it for its `HEALTHCHECK`.

## Crash reporting (Sentry)

Opt-in: set `SENTRY_DSN` and restart. When unset (the default) the SDK is
never initialized and nothing is ever sent.

```bash
# .env or your container's environment
SENTRY_DSN=https://xxxx@oXXXX.ingest.sentry.io/XXXX
```

Works with [sentry.io](https://sentry.io) (free tier is fine for a single
instance) or any self-hosted Sentry-compatible backend such as
[GlitchTip](https://glitchtip.com).

What gets captured:

- **Uncaught exceptions and unhandled rejections** in the main process.
  Capture only — the existing fatal/non-fatal logic in `src/index.ts` still
  decides whether the process exits.
- **Unhandled route errors** via the Express error handler (the JSON error
  response sent to clients is unchanged).

Optional variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `SENTRY_ENVIRONMENT` | `NODE_ENV` | Environment tag on events |
| `SENTRY_TRACES_SAMPLE_RATE` | `0` | Performance tracing; `0` = errors only |
| `TUNECAMP_GIT_SHA` | set by Docker build | Release tag, links errors to a deploy |

On CapRover the release tag is filled automatically from
`CAPROVER_GIT_COMMIT_SHA` at build time.

In Sentry, enable an alert rule ("Send a notification for new issues") to get
emailed on the first occurrence of each new error.

## Uptime check (external)

A crash reporter cannot tell you the whole machine or container is down — use
an external pinger for that. Any of these free services works:

- [UptimeRobot](https://uptimerobot.com) — HTTP(s) monitor
- [healthchecks.io](https://healthchecks.io)
- [Better Stack](https://betterstack.com/uptime)

Configuration: monitor `https://your-instance.example.com/health`, interval
1–5 minutes, alert via email/Telegram. Expect `200 OK`.

## OOM kills on Docker Swarm / CapRover

Swarm *replaces* unhealthy or OOM-killed tasks instead of restarting them, so
a crashed container disappears from `docker ps`. To diagnose:

```bash
docker service ps <service-name> --no-trunc   # exit codes of dead tasks
# "task: non-zero exit (137)" = OOM-killed
docker service logs <service-name> --since 1h
```

Exit code 137 means the kernel killed the process for exceeding its memory
limit — raise the service memory limit or look in Sentry for what was
allocating just before death.
