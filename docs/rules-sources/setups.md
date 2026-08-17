# Ploy initial setups

Transcribed from `ploy-1970-3m-instructions.png`. Rows are rank 9 down to rank 1; columns are a through i. `.` is empty. Tokens are `{color}:{piece}{rot}`.

Colors: `g` Green, `c` Coral, `y` Yellow, `b` Blue. Pieces: `C`, `LH`, `LM`, `LL`, `PH`, `PM`, `PL`, `S`.

Two-player armies are 15 pieces per color (1 Commander, 6 Lances, 5 Probes, 3 Shields). Four-player and partnership armies are 9 pieces per color (1 Commander, 2 Lances, 3 Probes, 3 Shields).

## Two-player

```text
9  . c:LM4 c:LL4 c:LH4 c:C1  c:LH4 c:LL4 c:LM4 .
8  . .     c:PH3 c:PM3 c:PL0 c:PM3 c:PH4 .     .
7  . .     .     c:S4  c:S4  c:S4  .     .     .
6  . .     .     .     .     .     .     .     .
5  . .     .     .     .     .     .     .     .
4  . .     .     .     .     .     .     .     .
3  . .     .     g:S0  g:S0  g:S0  .     .     .
2  . .     g:PH0 g:PM7 g:PL0 g:PM7 g:PH7 .     .
1  . g:LM0 g:LL0 g:LH0 g:C1  g:LH0 g:LL0 g:LM0 .
```

## Partnership

```text
9  . c:LM4 c:C1  c:LH4 . b:LH4 b:C1  b:LM4 .
8  . c:PH3 c:PM3 c:PH4 . b:PH3 b:PM3 b:PH4 .
7  . c:S4  c:S4  c:S4  . b:S4  b:S4  b:S4  .
6  . .     .     .     . .     .     .     .
5  . .     .     .     . .     .     .     .
4  . .     .     .     . .     .     .     .
3  . g:S0  g:S0  g:S0  . y:S0  y:S0  y:S0  .
2  . g:PH0 g:PM7 g:PH7 . y:PH0 y:PM7 y:PH7 .
1  . g:LM0 g:C1  g:LH0 . y:LH0 y:C1  y:LM0 .
```

## Four-player free-for-all

```text
9  c:C0  c:LH3 c:PH4 . . . y:PH3 y:LM5 y:C0
8  c:LM3 c:PM2 c:S3  . . . y:S5  y:PM4 y:LH5
7  c:PH1 c:S3  c:S3  . . . y:S5  y:S5  y:PH6
6  .     .     .     . . . .     .     .
5  .     .     .     . . . .     .     .
4  .     .     .     . . . .     .     .
3  g:PH2 g:S1  g:S1  . . . b:S7  b:S7  b:PH5
2  g:LH1 g:PM0 g:S1  . . . b:S7  b:PM6 b:LM7
1  g:C0  g:LM1 g:PH7 . . . b:PH0 b:LH7 b:C0
```
