import express from "express";
import { AutocompleteService } from "../service/AutocompleteService.js";
import { createRoutes } from "./routes.js";

export function createServer(service: AutocompleteService) {
    const app = express();

    app.use(express.json());

    //cors
    app.use((req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        next();
    });

    //routes
    app.use(createRoutes(service));

    //error handling
    app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
        console.error(err.message);
        res.status(500).json({ error: 'Internal server error' });
    });

    return app;
}
