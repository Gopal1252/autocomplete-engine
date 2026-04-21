import express, {Router} from "express";
import { AutocompleteService } from "../service/AutocompleteService.js";

export function createRoutes(service : AutocompleteService): Router{
    const router = express.Router();

    router.get('/autocomplete', async (req, res) => {
        const prefix = req.query.q as string;
        if(!prefix){
            res.status(400).json({error : 'Missing q parameter'});
            return;
        }

        const n = req.query.n ? parseInt(req.query.n as string) : undefined

        const hitsBefore = service.getStats().totalCacheHits;
        const start = performance.now();
        const suggestions = await service.getSuggestions(prefix, n);
        const queryTimeMs = parseFloat((performance.now() - start).toFixed(3));
        const fromCache = service.getStats().totalCacheHits > hitsBefore;

        res.json({ suggestions, meta: { queryTimeMs, fromCache } });
    });

    router.post('/ingest', async (req, res) => {
        const { logs } = req.body;
        await service.ingest(logs);
        res.json({ ingested: logs.length });
    });

    router.post('/event', async (req, res) => {
        await service.trackEvent(req.body);
        res.json({ ok: true });
    });

    router.get('/stats', (req, res) => {
        res.json(service.getStats());
    });

    //health checkup endpoints
    router.get('/health', (req, res) => {
        res.json({status : "ok"})
    });

    router.get('/ready', async (req, res) => {
        const checks = await service.healthCheck();
        const healthy = checks.postgres === "ok" && checks.redis === "ok" && checks.booted;
        res.status(healthy? 200 : 503).json({
            status : healthy ? "ready" : "not ready",
            checks
        });
    });

    return router;
}
