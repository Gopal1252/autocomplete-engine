export class Cleaner{
    static clean(raw: string): string{
        return raw
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9 ]/g,"")
            .replace(/\s+/g," ");
    }

    static isValid(cleanedString: string): boolean{
        return cleanedString.length >= 2;
    }

    static tokenize(cleanedString: string): string[]{
        return cleanedString.split(' ');
    } 
}