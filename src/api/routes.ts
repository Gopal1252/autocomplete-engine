import express, { Router } from "express";
import { z } from "zod";
import { AutocompleteService } from "../service/AutocompleteService.js";
import { IngestSchema, EventSchema, AutocompleteQuerySchema } from "./schemas.js";

// validate data against a zod schema; on failure send 400 and return null
function parse<T>(schema: z.ZodType<T>, data: unknown, res: express.Response): T | null {
    const result = schema.safeParse(data);
    if (!result.success) {
        res.status(400).json({ error: 'Invalid request', details: result.error.issues });
        return null;
    }
    return result.data;
}

export function createRoutes(service: AutocompleteService): Router {
    const router = express.Router();

    router.get('/autocomplete', async (req, res) => {
        const query = parse(AutocompleteQuerySchema, req.query, res);
        if (!query) return;
        const { q, n } = query;

        const hitsBefore = service.getStats().totalCacheHits;
        const start = performance.now();
        const suggestions = await service.getSuggestions(q, n);
        const queryTimeMs = parseFloat((performance.now() - start).toFixed(3));
        const fromCache = service.getStats().totalCacheHits > hitsBefore;

        res.json({ suggestions, meta: { queryTimeMs, fromCache } });
    });

    router.post('/ingest', async (req, res) => {
        const body = parse(IngestSchema, req.body, res);
        if (!body) return;

        await service.ingest(body.logs);
        res.json({ ingested: body.logs.length });
    });

    router.post('/event', async (req, res) => {
        const body = parse(EventSchema, req.body, res);
        if (!body) return;

        await service.trackEvent(body);
        res.json({ ok: true });
    });

    router.get('/stats', (req, res) => {
        res.json(service.getStats());
    });

    //health checkup endpoints
    router.get('/health', (req, res) => {
        res.json({ status: "ok" });
    });

    router.get('/ready', async (req, res) => {
        const checks = await service.healthCheck();
        const healthy = checks.postgres === "ok" && checks.redis === "ok" && checks.booted;
        res.status(healthy ? 200 : 503).json({
            status: healthy ? "ready" : "not ready",
            checks
        });
    });

    return router;
}
