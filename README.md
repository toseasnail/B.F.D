# B.F.D. — Black Friday Desk

Online table for Friedemann Friese’s **Black Friday** (2023). This is a fan-made playable site, not an official 2F-Spiele / Rio Grande product.

## Play

```bash
npm install
npm start
```

Open `http://localhost:3000`.

- **Play vs M.I.B.S.** — solo against one to four automas (five chairs max). Easy mode buys/sells one fewer certificate and sometimes second-guesses itself. Hard mode follows the printed M.I.B.S. priorities.
- **Waiting for players** — sit at a desk. Anyone else who clicks the same button (same seat count and automa setting) is matched to you. You can also share the 4-character room code.

Two-human games always seat M.I.B.S. as the third trader, matching the 2023 rulebook. Five-human games never include it.

## How a turn works

Choose exactly one action: buy shares, sell shares, or buy gold (quantity may be zero, which still parks a share on a track). Bonus tiles are one-shot extras. A filled purchase/gold track, or a depleted sale track, triggers a price change: shares are drawn from the bag, gold may jump, and the floor closes when gold reaches **$100**. Remaining shares cash out; small gold bars are $100 and big bars $500.

## Tests

```bash
npm test
```
