# Deploy su Railway (senza VPS)

Railway è una piattaforma gestita che esegue la tua istanza TuneCamp senza richiedere una VPS, accesso SSH o gestione del server. Un singolo click effettua il deployment a partire dal template ufficiale.

## Deploy in un click

[![Deploy su Railway](https://railway.com/button.svg)](https://railway.com/deploy/tunecamp?referralCode=BUSsSY&utm_medium=integration&utm_source=template&utm_campaign=generic)

Questo configura automaticamente:
- Il server Node.js di TuneCamp
- Un volume persistente per il database SQLite e i file multimediali
- Un URL HTTPS pubblico su `.railway.app` (utilizzabile per la federazione)

## Cosa ottieni

| Funzionalità | Dettaglio |
|---------|--------|
| HTTPS | Automatico — nessun Nginx o Certbot richiesto |
| Archiviazione persistente | Volume collegato in `/app/data` |
| Variabili d'ambiente | Configurabili nel dashboard Railway → scheda Variables |
| Dominio personalizzato | Aggiungi il tuo in Railway → Settings → Domains |
| Log | Dashboard Railway → Deployments → View logs |

## Variabili d'ambiente

Imposta queste variabili in **Railway → Variables** prima o dopo il primo deploy:

| Variabile | Richiesta | Default | Descrizione |
|----------|----------|---------|-------------|
| `TUNECAMP_PUBLIC_URL` | Sì (per federazione) | — | Il tuo URL pubblico completo, es. `https://yourname.up.railway.app` |
| `TUNECAMP_ADMIN_USER` | No | `admin` | Sovrascrive il nome utente admin predefinito |
| `TUNECAMP_ADMIN_PASS` | No | `admin` | Sovrascrive la password admin predefinita — **modificala immediatamente** |
| `JWT_SECRET` | Consigliata | auto-generata | Imposta una stringa casuale stabile affinché le sessioni resistano ai re-deploy |

## Primo accesso

Credenziali predefinite (uguali al percorso Docker):

| Nome utente | Password |
|----------|----------|
| `admin` | `admin` |

Modifica la password immediatamente in **Admin → Impostazioni**.

## Media persistenti

I volumi di Railway rimangono intatti dopo i re-deploy. Il tuo database SQLite e i file multimediali caricati/scansionati risiedono all'interno del volume. Se devi caricare una grande libreria, utilizza uno dei percorsi di acquisizione remota anziché lo script di scansione locale:

- [Bot Telegram](./telegram.md)
- [Google Drive](./google-drive.md)

## Limiti

Il piano gratuito Hobby di Railway presenta limiti sulle ore di esecuzione. Per un'istanza di produzione con un traffico di streaming elevato, passa a un piano a pagamento o considera una VPS con Docker (vedi [Inizia](./getting-started.md)).

## Dominio personalizzato + federazione

Per federarsi con altre istanze TuneCamp, ActivityPub richiede un URL HTTPS stabile. Imposta `TUNECAMP_PUBLIC_URL` con l'URL della tua app Railway (o un dominio personalizzato) e registrati presso un'istanza directory:

```bash
curl -X POST https://directory.example.com/api/community/register \
     -H "Content-Type: application/json" \
     -d '{"url": "https://yourname.up.railway.app"}'
```
