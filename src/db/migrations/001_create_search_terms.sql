CREATE TABLE IF NOT EXISTS search_terms (                                                                                                                  
    term TEXT PRIMARY KEY,
    frequency INTEGER NOT NULL DEFAULT 1,
    last_updated BIGINT NOT NULL,
    click_through_rate REAL NOT NULL DEFAULT 0
); 