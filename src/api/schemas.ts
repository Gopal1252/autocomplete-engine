import { z } from "zod";

// POST /ingest
export const IngestSchema = z.object({
    logs: z.array(z.object({
        query: z.string(),
        timestamp: z.number(),
        clicked: z.boolean().optional(),
    })),
});

// POST /event
export const EventSchema = z.object({
    type: z.enum(['impression', 'click']),
    terms: z.array(z.string()).min(1),
    prefix: z.string(),
    timestamp: z.number(),
});

// GET /autocomplete query params
export const AutocompleteQuerySchema = z.object({
    q: z.string().min(1),
    n: z.coerce.number().int().positive().optional(),
});
