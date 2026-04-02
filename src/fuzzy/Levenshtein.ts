export function levenshteinDistance(s: string, t: string): number {
    const n = s.length;
    const m = t.length;

    const dp: number[][] = Array.from({length: n + 1}, () => new Array(m + 1).fill(0));

    for (let j = 0; j <= m; j++) {
        dp[0][j] = j;
    }

    for (let i = 0; i <= n; i++) {
        dp[i][0] = i;
    }

    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            if (s[i - 1] === t[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = 1 + Math.min(
                    dp[i - 1][j],     // delete from s
                    dp[i][j - 1],     // insert into s
                    dp[i - 1][j - 1]  // replace
                );
            }
        }
    }

    return dp[n][m];
}
