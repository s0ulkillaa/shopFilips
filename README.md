# shopFilips

Questo progetto usa PostgreSQL con Docker Compose per salvare utenti registrati in un database reale, invece di memorizzare i dati solo nel localStorage del browser.

## Requisiti
- Docker Desktop o Docker Engine
- Node.js 20+

## Avvio del database

```bash
docker compose up -d
```

## Avvio dell'applicazione

```bash
npm install
npm start
```

Apri quindi il sito in browser su:

```text
http://localhost:3001/login.html
```

## Configurazione DB

Le credenziali di default sono:
- database: `shopfilips`
- utente: `filips`
- password: `filips`
- porta: `5433` (la porta interna del container resta `5432`)

Puoi collegarti con DBeaver usando questi dati.
