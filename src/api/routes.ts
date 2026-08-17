import express, { Router } from "express";
import { z } from "zod";
import { AutocompleteService } from "../service/AutocompleteService.js";
import { IngestSchema, EventSchema, AutocompleteQuerySchema, PutTermSchema, BlocklistPostSchema } from "./schemas.js";
import { error } from "console";

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

        const start = performance.now();
        const { suggestions, tier } = await service.getSuggestions(q, n);
        const queryTimeMs = parseFloat((performance.now() - start).toFixed(3));

        res.json({ suggestions, meta: { queryTimeMs, fromCache: tier !== 'miss', cacheTier: tier } });
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

    router.get('/stats', (_req, res) => {
        res.json(service.getStats());
    });

    //health checkup endpoints
    router.get('/health', (_req, res) => {
        res.json({ status: "ok" });
    });

    router.get('/ready', async (_req, res) => {
        const checks = await service.healthCheck();
        const healthy = checks.postgres === "ok" && checks.redis === "ok" && checks.booted;
        res.status(healthy ? 200 : 503).json({
            status: healthy ? "ready" : "not ready",
            checks
        });
    });

    //keeps render awake, and touches postgres + redis so they don't go idle
    router.get('/keepalive', async (req, res) => {
        const token = process.env.KEEPALIVE_TOKEN;
        if (!token || req.query.token !== token) {
            res.status(401).json({ ok: false, error: 'Unauthorized' });
            return;
        }

        const checks = await service.keepalive();
        const healthy = checks.postgres === "ok" && checks.redis === "ok";
        res.set('Cache-Control', 'no-store');
        res.status(healthy ? 200 : 503).json({
            ok: healthy,
            ...checks,
            at: new Date().toISOString()
        });
    });

    router.get('/terms', (_req, res) => {
        const terms = service.getAllTerms();
        res.json({ terms, count: terms.length });
    });

    router.get('/terms/:term', (req,res) => {
        const term = decodeURIComponent(req.params.term);
        const result = service.getTerm(term);
        if(!result){
            res.status(404).json({error : 'Term not found'});
            return;
        }
        res.json(result);
    });

    router.put('/terms/:term', async (req, res) => {
        const term = decodeURIComponent(req.params.term);
        const body = parse(PutTermSchema, req.body, res);
        if(!body) return;

        try{
            const entry = await service.putTerm(term, body);
            res.json(entry);
        }catch(e){
            res.status(400).json({error: e instanceof Error ? e.message : String(e)});
        }
    });

    router.delete('/terms/:term', async (req, res) => {
        const term = decodeURIComponent(req.params.term);
        const deleted = await service.deleteTerm(term);
        if (!deleted) {
            res.status(404).json({ error: 'Term not found' });
            return;
        }
        res.json({ deleted: term });
    });

    router.delete('/terms', async (_req, res) => {
        const count = await service.deleteAllTerms();
        res.json({ deleted: 'all', count });
    });

    router.get('/blocklist', (_req, res) => {
        const terms = service.getBlocklist();
        res.json({ terms, count: terms.length });
    });

    router.post('/blocklist', async (req, res) => {
        const body = parse(BlocklistPostSchema, req.body, res);
        if (!body) return;

        const blocked = await service.addToBlocklist(body.terms);
        res.json({ blocked });
    });

    router.delete('/blocklist/:term', async (req, res) => {
        const term = decodeURIComponent(req.params.term);
        const removed = await service.removeFromBlocklist(term);
        if (!removed) {
            res.status(404).json({ error: 'Term not found in blocklist' });
            return;
        }
        res.json({ unblocked: term });
    });

    return router;
}
