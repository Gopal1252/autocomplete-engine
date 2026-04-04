import { AutocompleteService } from "./service/AutocompleteService.js";
import { AutocompleteConfig } from "./core/types.js";
import { createServer } from "./api/server.js";
import { seedData } from "./data/seed.js";

const DEFAULT_CONFIG: AutocompleteConfig = {                                                                                                               
    maxSuggestions: 10,                                                                                                                                    
    cacheTTLMs: 5 * 60 * 1000,       // 5 minutes                                                                                                          
    cacheMaxSize: 10000,                                                                                                                                   
    fuzzyMaxDistance: 2,
    fuzzyEnabled: true,                                                                                                                                    
    rankingWeights: {                                                                                                                                      
        frequency: 0.5,
        recency: 0.3,                                                                                                                                      
        clickThrough: 0.2,
    },                                                                                                                                                     
};

const autocompleteservice = new AutocompleteService(DEFAULT_CONFIG);
autocompleteservice.ingest(seedData);

const server = createServer(autocompleteservice);

const PORT = 3000;                                                                                                                                         
  server.listen(PORT, () => {                                                                                                                                
      console.log(`Autocomplete engine ready — ${autocompleteservice.getStats().totalTerms} terms indexed, listening on port ${PORT}`);                      
  }); 