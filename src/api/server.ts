import express from "express";
import cors from "cors";
import compression from "compression";
import { AutocompleteService } from "../service/AutocompleteService.js";
import { createRoutes } from "./routes.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger('Server');

export function createServer(service: AutocompleteService) {
    const app = express();

    app.use(express.json());
    app.use(cors({
        origin: process.env.CORS_ORIGIN || '*',
    }));
    app.use(compression());

    //routes
    app.use(createRoutes(service));

    //error handling
    app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        log.error(err.message);
        res.status(500).json({ error: 'Internal server error' });
    });

    return app;
}
