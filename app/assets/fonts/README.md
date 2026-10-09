# Archivo

Self-hosted variable Archivo (width 62–125, weight 100–900, upright) used by `app/styles/fonts.css`.

| File                           | Source                                                                          | SHA-256                                                            |
| ------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `archivo-latin-wdth.woff2`     | `@fontsource-variable/archivo@5.3.0` `files/archivo-latin-wdth-normal.woff2`     | `e3a28eade21a900c7155a247757f4b2834c07bb7ef07ad7efa55cebaac1e8f5e` |
| `archivo-latin-ext-wdth.woff2` | `@fontsource-variable/archivo@5.3.0` `files/archivo-latin-ext-wdth-normal.woff2` | `5717f37059660ca5c899bad6c48ee22c3ac55cb3c484055241689d0f905a1a86` |

The package repackages Google Fonts' `Archivo[wdth,wght]` (version 25). The font is licensed under the SIL Open Font License 1.1; see `OFL.txt`. The package is not a dependency: these files were extracted once with `npm pack`.

The fallback face in `fonts.css` adjusts local Arial to Archivo's metrics (Archivo: ascent 878, descent 210, average width 440 per 1000 units; Arial: average width 913 per 2048 units), giving `size-adjust: 98.7%`, `ascent-override: 88.96%` and `descent-override: 21.28%`.
