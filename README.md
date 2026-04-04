# Autocomplete Engine

A search autocomplete backend built in TypeScript. Implements trie-based prefix search, weighted ranking, LRU caching, fuzzy matching, and a data ingestion pipeline — all from scratch, no external libraries for the core logic.

Built as a learning project to understand how autocomplete systems work under the hood.

## Quick Start

```bash
git clone <repo-url>
cd autocomplete-engine
npm install
npm run dev
```

The server starts on port 3000 with ~70 seed terms pre-loaded.

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
- **LRU Cache** with TTL to avoid redundant lookups
- **Ingestion Pipeline** cleans and normalizes raw search logs before indexing
- **AutocompleteService** ties everything together
