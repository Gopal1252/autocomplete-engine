# Autocomplete Engine

A search autocomplete backend built in TypeScript. Implements trie-based prefix search, weighted ranking, two-layer caching (in-memory LRU + Redis), fuzzy matching, and a data ingestion pipeline — all core data structures built from scratch.

Built as a learning project to understand how autocomplete systems work under the hood.

## Prerequisites

- Node.js
- PostgreSQL (running locally)
- Redis (running locally)

## Quick Start

```bash
git clone <repo-url>
cd autocomplete-engine
npm install
```

Create a `.env` file:
```
DB_HOST=localhost
DB_PORT=5432
DB_USER=youruser
DB_PASSWORD=yourpassword
DB_NAME=autocomplete
REDIS_HOST=localhost
REDIS_PORT=6379
LOG_LEVEL=info
```

Then:

```bash
createdb autocomplete
npm run dev
```

On first run, the server seeds the database with ~70 terms. On subsequent runs, it loads from Postgres.

## Try it

```bash
curl "http://localhost:3000/autocomplete?q=spo&n=5"
```

## API

### Search
- `GET /autocomplete?q=<prefix>&n=<count>` — ranked suggestions for a prefix
- `POST /ingest` — add search terms from raw query logs
- `POST /event` — record impression/click events (feeds CTR ranking)

### Term management
- `GET /terms/:term` — fetch a single term's metadata
- `PUT /terms/:term` — create or update a term with explicit frequency / CTR
- `DELETE /terms/:term` — remove a term
- `DELETE /terms` — wipe all terms

### Blocklist
- `GET /blocklist` — list blocked terms
- `POST /blocklist` — block one or more terms (filtered from results)
- `DELETE /blocklist/:term` — unblock

### Ops
- `GET /health` — liveness (always 200 if process is up)
- `GET /ready` — readiness (200 only if Postgres + Redis are reachable)
- `GET /stats` — cache hit rate, total terms, etc.

Example:
```bash
curl -X POST http://localhost:3000/ingest \
  -H "Content-Type: application/json" \
  -d '{"logs": [{"query": "your search term", "timestamp": 1712188800000}]}'
```

Request bodies are validated with [zod](https://zod.dev); invalid input returns 400 with details.

## Running Tests

```bash
npm test
```

## How it works

- **Trie** for fast prefix lookup
- **BK-tree** with Levenshtein distance for fuzzy matching (handles typos)
- **Ranker** scores results using frequency, recency, and click-through rate
- **Two-layer cache** — L1 (in-memory LRU) + L2 (Redis) with TTL
- **Ingestion Pipeline** cleans and normalizes raw search logs before indexing
- **Postgres** is the source of truth; the in-memory trie + BK-tree are rebuilt on boot
- **Blocklist** filters results after ranking, before top-N slicing (so N is always filled when possible)
- **AutocompleteService** ties everything together; the Express layer is a thin wrapper

Gzip response compression and graceful shutdown (SIGTERM/SIGINT drain + cleanup) are in place for hosting.
