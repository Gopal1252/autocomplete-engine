import { SearchTerm, ScoredSuggestion, RankingWeights } from "../core/types.js";

export class Ranker {
    private weights: RankingWeights;

    constructor(weights: RankingWeights) {
        this.weights = weights;
    }

    score(term: SearchTerm, maxFrequency: number): number {
        const normalizedFrequency = Math.log(1 + term.frequency) / Math.log(1 + maxFrequency);
        const daysSinceLastUpdate = (Date.now() - term.lastUpdated) / (1000 * 60 * 60 * 24);
        const recencyScore = 1 / (1 + daysSinceLastUpdate);

        return (this.weights.frequency * normalizedFrequency)
             + (this.weights.recency * recencyScore)
             + (this.weights.clickThrough * term.clickThroughRate);
    }

    rank(terms: SearchTerm[]): ScoredSuggestion[] {
        if (terms.length === 0) return [];

        const maxFrequency = Math.max(...terms.map(t => t.frequency));

        return terms
            .map(term => ({
                term: term.term,
                score: this.score(term, maxFrequency),
            }))
            .sort((a, b) => b.score - a.score);
    }
}
