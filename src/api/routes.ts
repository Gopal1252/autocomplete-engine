import express, {Router} from "express";
import { AutocompleteService } from "../service/AutocompleteService.js";

export function createRoutes(service : AutocompleteService): Router{
    const router = express.Router();

    router.get('/autocomplete',(req, res) => {
        const prefix = req.query.q as string;
        if(!prefix){
            res.status(400).json({error : 'Missing q parameter'});
            return;
        }

        const n = req.query.n ? parseInt(req.query.n as string) : undefined

        const hitsBefore = service.getStats().cacheHits;
        const start = performance.now();
        const suggestions = service.getSuggestions(prefix, n);
        const queryTimeMs = parseFloat((performance.now() - start).toFixed(3));
        const fromCache = service.getStats().cacheHits > hitsBefore;

        res.json({ suggestions, meta: { queryTimeMs, fromCache } });
    });

    router.post('/ingest', (req, res) => {                                                                                                                     
        const { logs } = req.body;                                                                                                                             
        service.ingest(logs);                                                                                                                                  
        res.json({ ingested: logs.length });
    });

    router.post('/event', (req, res) => {                                                                                                                      
        service.trackEvent(req.body);                                                                                                                          
        res.json({ ok: true });                                                                                                                                
    }); 

    router.get('/stats', (req, res) => {                                                                                                                       
        res.json(service.getStats());                                                                                                                          
    }); 

    return router;
}