# Life success profile explorer

An interactive explorer for comparing a Big Five personality profile with research-derived forms of life success. It includes elevation, shape similarity, and an approximate combined regression model.

## Published app

**[Open the Life success profile explorer](https://lstehlik2809.github.io/life-success-profile-match/)**

The public app is deployed automatically from the `main` branch with GitHub Pages.

## Local development

Requires Node.js 20.19+ (20.x), or 22.12+. Dependencies are pinned in `package-lock.json`.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5175**. The development server binds to the local loopback interface. For a production bundle, use `npm run build`; `npm run preview` serves that bundle locally at http://127.0.0.1:4175.

```sh
npm test
npm run build
```

## What this version computes

The user enters five Big Five **domain percentiles**. Emotional stability and neuroticism are explicitly supported as opposite directions. Blank, malformed and out-of-range values pause all results.

Valid percentiles are converted to normal-score coordinates. Values outside 0.5–99.5 are limited to those boundaries **for calculation only**, while the original input remains visible and the affected traits are flagged. This transparent, symmetric tail convention avoids infinite quantiles and preserves monotonicity. It is an approximation, not an instrument norm.

The app displays **descriptive elevation** as the mean of the five normal-score coordinates, not the mean of the input percentiles. This is not a standardized composite or a normative elevation percentile.

Three comparison views are available:

- **Shape similarity** (default): Pearson correlation across five trait coordinates against the published mean centered pattern. Range −1 to +1. Uniform shifts and positive rescaling of the profile leave this score unchanged.
- **Elevation component:** the model component associated with the common trait level in each research index, excluding the pattern component.
- **Combined model:** the sum of the elevation and weighted linear pattern components. Both components remain visible in the result cards and criterion details. Unlike Pearson similarity, the pattern component retains the magnitude of trait differences.

For each criterion j, the combined model uses the observed predictor matrix C from supplemental Table S7 and the observed trait–criterion vector r_j from the authors' analysis workbook:

```text
beta_j       = solve(C, r_j)
elevation_j  = mean(beta_j) * sum(z)
pattern_j    = (beta_j - mean(beta_j)) dot z
combined_j   = elevation_j + pattern_j = beta_j dot z
index_group  = mean(combined_j for every criterion j in that group)
```

These are ordinary regression coefficients. The app does not average the published MACPA component coefficients and then apply them to a standardized group centroid. It does not use an arbitrary 71/29 mixture. Elevation and pattern add algebraically; no independence assumption is imposed.

Each type/family index is a defined **equal-weight mean of modeled standardized criteria**. A family averages all its member variables directly, not its differently sized types with equal weight. Index units are **mean criterion SD units**. An index of +0.200 is not +0.200 SD on a measured family scale, an outcome percentile, or a probability of success. The app does not standardize the composite because the required criterion intercorrelations are unavailable. Equal weighting is an explicit app choice, not evidence that the constituent criteria have equal personal value or form a validated success scale.

The reconstruction is approximate because C is published at two-decimal precision. All 148 observed criterion vectors come from a pinned source workbook. Every reconstructed centered coefficient is within 0.010 of the published centered coefficients; every reconstructed multiple R is within 0.0065 of the printed R. These checks verify numerical correspondence only. The app’s indices have not been externally validated for individuals and should not be interpreted as forecasts.

Numerically flat profiles have undefined shape correlation. The shape view also pauses when effective percentiles span one point or less, an explicit product safeguard rather than a psychometric threshold. The linear views remain defined: an exactly flat profile has a zero pattern component, while its elevation component may be nonzero. At all five 50th percentiles, every linear score is zero and all results share a tie. Equal displayed scores share positions and are listed alphabetically: two-decimal precision for similarity and three for indices.

The what-if view evaluates every combination of decreased/unchanged/increased inputs at the selected ±1, ±5 or ±10 percentile-point step, using the **selected scoring mode**. Every scenario scores all clusters and families from the same input profile. Tail duplicates are removed. Flat/near-flat scenarios are excluded and counted only in shape mode; the linear modes include them. Ranges describe this finite grid, not exhaustive continuous bounds, confidence intervals, population frequencies or retest probabilities.

The app does not use an unsupported aggregation, implied zero-order reconstruction, custom matrix editor, fixed reliability labels, or fixed retest percentages. No index is converted into a normative percentile or success probability.

## Research data and provenance

### Research-pattern charts

Each expanded form of success contains a five-trait line chart in all three scoring modes. Its local radio control defaults to **Cluster average**, the app’s equal-weight mean of that cluster’s published centered patterns. This is not the Figure 6 exemplar or an exact reproduction of printed Figure 5. **Paper’s exemplar** selects the specific Figure 6 variable by an explicit numeric-cluster-ID → exact-source-name mapping, independently of the personalized variable sorting. Existing exemplar descriptions and variable counts remain unchanged.

The chart reads the published β* values from Tables 9–11, re-centered to remove small two-decimal rounding residues. All ten charts and both datasets use the same −0.250 to +0.250 vertical scale; signed values are displayed to three decimals to distinguish averages, without claiming extra source precision. For example, Ingenuity’s exemplar is `Organizational citizenship behavior: Change`: the printed vector [−0.01, −0.11, 0.03, 0.03, 0.05] becomes [−0.008, −0.108, 0.032, 0.032, 0.052].

β* means a regression coefficient minus its variable’s mean coefficient across the five traits. Positive and negative deviations indicate regression weights above or below that five-trait mean. Their signs do not imply causal effects and do not necessarily indicate a positive or negative overall association. The charts show fixed research patterns—not the user’s profile, required personal levels, success probabilities, elevation or the complete combined score. Switching datasets does not affect scoring. Generated interpretations preserve tied extrema. Charts include full trait labels, numeric text alternatives and a labeled zero baseline; narrow screens scroll the chart locally.

These are redraws inspired by [Figure 6 (p. 801) and Tables 9–11](https://doi.org/10.1037/bul0000476), not exact recreations. Confidence/error bars are intentionally omitted because their numeric values are unavailable here. The app uses no new chart dependencies or external assets.

### Source data

- `data.js` contains all **148 rows / 1,184 numerical entries** from the audited transcription of Wilmot, Wiernik and Ones (2025), Tables 9–11. Every numeric entry was compared with the supplied PDF.
- Cluster details explain that membership reflects similar Big Five regression-weight patterns, not just shared subject matter. Ingenuity is presented as a research theme, with a plain-language exemplar alongside its full source label, `Organizational citizenship behavior: Change`. Its 21 variables include that exemplar, interpersonal sensitivity and walking speed; these are not all direct measures of innovation. This clarification follows Table 10 (pp. 798–799) and the cluster discussion (p. 802), without changing membership or scoring.
- The source's 21 reverse-keyed variables carry explicit direction-aware labels. Their numeric vectors were already reversed in the paper and are not reversed again.
- `OBSERVED_S7` contains the observed Big Five intercorrelations from supplemental Table S7. The linear model uses this immutable matrix; pure shape similarity does **not** require it.
- `regression-data.js` contains 148 observed criterion vectors (740 correlations) from the authors' analysis workbook, with explicit source-name mappings. The analysis sheets already reverse negative criteria; no further reversal is applied.
- `research/b5_profiles_data.xlsx` is the pinned source workbook. `research/provenance.json` records its download URL, SHA-256, conventions and audit results. `research/verify_source.py` checks all 740 values against the workbook offline (requires Python and `openpyxl`).
- Shape centroids retain the published rounded criterion-pattern deviations, recentered for rounding residue. The linear views use coefficients reconstructed from the observed correlations. Full-precision reproduction and external validation remain future research work; this version does not claim either.
- The method page distinguishes the broader 204-variable model summaries from the 148 variables retained in the clusters. It correctly explains `beta* = beta − mean(beta)`, the profile-level-only exclusions, and the limitations of individual application.

Sources:

- [Research paper](https://doi.org/10.1037/bul0000476)
- [APA supplemental materials](https://supp.apa.org/psycarticles/supplemental/bul0000476/bul0000476_Supplemental_Materials.docx)
- [Authors' data and code](https://osf.io/d5gqx/)
- [Source analysis workbook](https://osf.io/zj9n7/)
- [Correction to Figure 1](https://doi.org/10.1037/bul0000504)

## Review findings resolved

| Finding | Resolution |
|---|---|
| Reverse-scored labels | Explicit metadata and scored-direction labels for all 21 variables |
| Placeholder matrix | Verified observed S7 matrix in the linear model; no matrix dependency in shape scoring |
| Shape/percentile mismatch | Pure Pearson similarity; no invented population-percentile conversion |
| Unsupported expected outcomes | Criterion-specific ordinary regressions; explicit equal-weight index; no personal success standing or probability claims |
| Invalid rank confidence | Joint deterministic input scenarios; no confidence cutoff, overlap test or retest percentages |
| Misinterpreted beta* | Correct centered-coefficient explanation and example |
| Input coercion, N/ES and norms | String input validation, explicit reversal and visible tail handling |
| Impossible custom matrices | Matrix editor removed; fixed source matrix checked for positive definiteness |
| Flat-profile winner | Shape view pauses; linear views retain defined elevation components and group all equal displayed scores |
| Additional explanatory errors | Research scope, coefficient precision, Figure 5 inconsistency and exclusion groups corrected |

## Files and checks

- `life-success-profile-match.jsx`: React interface, input states, research explanation and sensitivity display.
- `model.js`: pure validation, conversion, matching, tie and scenario functions.
- `regression.js`: covariance solver, criterion-specific regressions, algebraic decomposition, group indices and sensitivity by mode.
- `data.js`: source values and research metadata.
- `regression-data.js`: observed trait–criterion correlations from the pinned workbook.
- `model.test.js`: regression checks for data preservation, reverse direction, missing inputs, N/ES equivalence, tails, quantiles, shape invariance, flat profiles, family aggregation, ties and joint scenario results.
- `regression.test.js`: source pinning, covariance validity, agreement with published results, exact decomposition, elevation/amplitude behavior, criterion weighting, flat linear profiles and mode-specific sensitivity.
- `research-patterns.js`: explicit Figure 6 exemplar mapping, fixed chart scale, source-only pattern selection, display formatting and tie-aware interpretation.
- `ResearchPatternChart.jsx`: independent per-cluster radio selection, accessible SVG and research-pattern explanation.
- `research-patterns.test.js`: all ten source mappings and literal exemplar oracles, centering, means, bounds, non-mutation, mode independence and tied interpretations.
- `research-pattern-chart.test.js`: server-rendered chart structure, default selection, unique control names, accessible labels and research caveats using the existing Vite/React dependencies. Browser interaction and responsive/theme appearance still require runtime verification.

The data-preservation tests verify the integrity of the audited source values and model structure. Update their provenance expectations only after an explicit source review.

Verification on 4 September 2026: all automated tests passed, and the production build succeeded. The offline source audit confirmed all 740 observed correlations match the pinned workbook. The tests cover every covariance coordinate, sparse numeric/text profiles, missing-result suppression and recovery, typed solver inputs, and the existing numerical thresholds.

Research-chart implementation checks on 4 September 2026: `npm test` passed all 53 reported tests (including the existing 40-test baseline and the new pure-data/server-render checks), and `npm run build` succeeded. These automated results do not establish browser keyboard interaction or responsive/theme appearance; those need separate runtime checks.

All user entries are held in this browser tab's memory. The app sends no questionnaire data to a server and does not use cookies or local storage for profiles. External source links open only when the user chooses them.

## Appearance

The interface starts in light mode. The Light / Dark button in the header switches appearance without changing inputs, comparisons, or open research details. It is keyboard accessible and exposes its dark-mode state to assistive technology.

Only the appearance preference is saved in local storage. Reloading keeps that preference while clearing profile entries. If browser storage is unavailable, the switch still works for the current session. No external fonts or visual asset services are used.
