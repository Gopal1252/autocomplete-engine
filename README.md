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

**GET /autocomplete?q=prefix&n=count**

Returns ranked suggestions for a prefix.

**POST /ingest**

Add new search terms at runtime.

```bash
curl -X POST http://localhost:3000/ingest \
  -H "Content-Type: application/json" \
  -d '{"logs": [{"query": "your search term", "timestamp": 1712188800000}]}'
```

**POST /event**

Track impressions and clicks for CTR-based ranking.

**GET /stats**

Returns system stats (cache hit rate, total terms, etc).

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
- **AutocompleteService** ties everything together
