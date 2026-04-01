import { TrieNode } from "./TrieNode.js";
import { SearchTerm } from "./types.js";

export class Trie{
    root: TrieNode;

    constructor(){
        this.root = new TrieNode();
    }

    insert(term: string, metadata: SearchTerm): void{
        let temp = this.root;
        for(let i=0;i<term.length;i++){
            if(temp.children.has(term[i])){
                temp = temp.children.get(term[i])!;
            }
            else{
                let nextNode = new TrieNode();
                temp.children.set(term[i],nextNode);
                temp = nextNode;
            }
        }
        temp.isEndOfWord = true;
        temp.metadata = metadata;
    }

    dfs(root: TrieNode, suggestions: SearchTerm[]): void{
        if(root.isEndOfWord){
            suggestions.push(root.metadata!);
        }

        for(const [char,trieNode] of root.children){
            this.dfs(trieNode,suggestions);
        }
    }

    search(prefix: string): SearchTerm[] {
        let suggestions: SearchTerm[] = [];
        let temp = this.root;
        for(let i=0;i<prefix.length;i++){
            if(!temp.children.has(prefix[i])){
                return suggestions;
            }
            else{
                temp = temp.children.get(prefix[i])!;
            }
        }

        this.dfs(temp,suggestions);
        return suggestions;
    }

    get(term: string): SearchTerm | null {
        let temp = this.root;
        for (let i = 0; i < term.length; i++) {
            if (!temp.children.has(term[i])) {
                return null;
            }
            temp = temp.children.get(term[i])!;
        }
        return temp.isEndOfWord ? temp.metadata : null;
    }

    has(term: string): boolean {
        let temp = this.root;
        for (let i = 0; i < term.length; i++) {
            if (!temp.children.has(term[i])) {
                return false;
            }
            temp = temp.children.get(term[i])!;
        }
        return temp.isEndOfWord;
    }

    delete(term: string): boolean {
        // Walk the trie, keeping track of each node and its parent char
        // so we can prune empty branches on the way back up
        const path: { node: TrieNode; char: string }[] = [];
        let temp = this.root;

        for (let i = 0; i < term.length; i++) {
            if (!temp.children.has(term[i])) {
                return false; // term doesn't exist
            }
            path.push({ node: temp, char: term[i] });
            temp = temp.children.get(term[i])!;
        }

        if (!temp.isEndOfWord) {
            return false; // path exists but it's not a complete term
        }

        temp.isEndOfWord = false;
        temp.metadata = null;

        // Prune: walk backwards, remove nodes that are childless and not end-of-word
        if (temp.children.size === 0) {
            for (let i = path.length - 1; i >= 0; i--) {
                const { node, char } = path[i];
                node.children.delete(char);
                // Stop pruning if this node has other children or is itself an end-of-word
                if (node.children.size > 0 || node.isEndOfWord) {
                    break;
                }
            }
        }

        return true;
    }

    getAllWithPrefix(prefix: string): SearchTerm[] {
        return this.search(prefix);
    }
}