export interface BKTreeNode {
    word: string;
    children: Map<number, BKTreeNode>;
}

export class BKTree {
    private root: BKTreeNode | null;
    private distanceFn: (a: string, b: string) => number;

    constructor(distanceFn: (a: string, b: string) => number) {
        this.root = null;
        this.distanceFn = distanceFn;
    }

    insert(term: string): void {
        if (this.root === null) {
            this.root = { word: term, children: new Map() };
            return;
        }

        let current = this.root;
        while (true) {
            const dist = this.distanceFn(term, current.word);
            if (dist === 0) return; // duplicate word, skip

            if (!current.children.has(dist)) {
                current.children.set(dist, { word: term, children: new Map() });
                return;
            }
            current = current.children.get(dist)!;
        }
    }

    search(query: string, maxDistance: number): string[] {
        const results: string[] = [];
        if (this.root === null) {
            return results;
        }

        const stack: BKTreeNode[] = [this.root];

        while (stack.length > 0) {
            const current = stack.pop()!;
            const dist = this.distanceFn(query, current.word);

            if (dist <= maxDistance) {
                results.push(current.word);
            }

            const minDist = dist - maxDistance;
            const maxDist = dist + maxDistance;

            for (const [childDist, childNode] of current.children) {
                if (childDist >= minDist && childDist <= maxDist) {
                    stack.push(childNode);
                }
            }
        }

        return results;
    }
}
