import React, { useLayoutEffect, useMemo, useState } from 'react';
import ResearchPatternChart from './ResearchPatternChart.jsx';
import { OBSERVED_S7 } from './data.js';
import {
  TRAITS, TRAIT_NAMES, FAMILIES, MIN_DISPLAY_SPAN, VARIABLES,
  profileFromFields, reverseField, parsePercentile,
  formatSimilarity, similarity,
} from './model.js';
import {
  MODES, profileElevation, criterionContributions, rankForMode,
  sensitivityForMode, formatScore,
} from './regression.js';

const EXAMPLE = ['62', '41', '74', '55', '88'];
const THEME_KEY = 'life-success-profile-match-app2-theme';

function initialTheme() {
  try {
    return window.localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}
const PAPER = 'https://doi.org/10.1037/bul0000476';
const SUPPLEMENT = 'https://supp.apa.org/psycarticles/supplemental/bul0000476/bul0000476_Supplemental_Materials.docx';
const sourceLink = (url, label) => <a href={url} target="_blank" rel="noreferrer">{label}<span className="sr-only"> (opens in a new tab)</span></a>;

function SimilarityBar({ value, bound = 1 }) {
  const scaled = value / bound;
  return <div className="similarity-track" aria-hidden="true">
    <span className="zero-line" />
    <span className="similarity-fill" style={{ left: `${scaled >= 0 ? 50 : 50 + scaled * 50}%`, width: `${Math.abs(scaled) * 50}%` }} />
    <span className="score-marker" style={{ left: `${50 + scaled * 50}%` }} />
  </div>;
}

function ScenarioPosition({ result }) {
  if (!result) return null;
  return <span className="scenario-position">Tested position{result.bestPosition === result.worstPosition ? ` ${result.bestPosition}` : `s ${result.bestPosition}–${result.worstPosition}`}</span>;
}

function ProfileShape({ profile }) {
  const max = Math.max(...profile.centered.map(Math.abs), 0.1);
  return <figure className="shape-figure">
    <figcaption>Your relative trait shape <span>Shown in emotional stability / AG / CO / EX / OP order</span></figcaption>
    <svg viewBox="0 0 650 145" role="img" aria-label={`Relative normal-score coordinates: ${TRAIT_NAMES.map((name, i) => `${name} ${profile.centered[i].toFixed(2)}`).join(', ')}. Each is centered on your average across traits.`}>
      <line x1="20" y1="70" x2="630" y2="70" stroke="var(--rule)" strokeDasharray="4 4" />
      {profile.centered.map((value, i) => {
        const x = 78 + i * 124, y = 70 - value / max * 48;
        return <g key={TRAITS[i]}>
          <line x1={x} x2={x} y1="70" y2={y} stroke="var(--accent)" strokeWidth="18" opacity=".18" />
          <circle cx={x} cy={y} r="5" fill="var(--accent)" />
          <text x={x} y="135" textAnchor="middle" fontSize="12" fill="var(--ink)">{TRAITS[i]}</text>
        </g>;
      })}
      <polyline points={profile.centered.map((value, i) => `${78 + i*124},${70 - value/max*48}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="1.5" />
    </svg>
    <p className="small">The dotted line is your average across the five transformed scores. The chart rescales to show shape; bar heights are not population percentiles.</p>
  </figure>;
}

function ContributionBreakdown({ row }) {
  return <dl className="contribution-breakdown" aria-label="Model contribution breakdown">
    <div><dt>Elevation</dt><dd>{formatScore(row.elevation,'combined')}</dd></div>
    <div><dt>Pattern</dt><dd>{formatScore(row.pattern,'combined')}</dd></div>
    <div><dt>Combined</dt><dd>{formatScore(row.combined,'combined')}</dd></div>
  </dl>;
}

function ProfileElevation({ profile }) {
  const elevation = profileElevation(profile);
  if (elevation === null) return null;
  return <div className="elevation-summary">
    <div><span className="eyebrow">Your overall elevation</span><strong>{formatScore(elevation,'combined')}</strong><span className="small">Average trait z-score</span></div>
    <p>The average of your five normal scores, with Neuroticism reversed into Emotional Stability. Zero is the reference midpoint; positive and negative values mean a higher or lower average. This is not a success score or a percentile of people’s overall elevation.</p>
  </div>;
}

function ClusterDetails({ row, z, mode }) {
  const [showWeights, setShowWeights] = useState(false);
  const isShape = mode === 'shape';
  const variables = useMemo(() => row.rows.map(variable => {
    const contributions = isShape ? {} : criterionContributions(z,variable);
    return {...variable,...contributions,match:isShape ? similarity(z,variable.pattern) : contributions[mode]};
  }).sort((a,b) => b.match-a.match || a.name.localeCompare(b.name)),[row.rows,z,mode,isShape]);
  return <div className="cluster-details">
    <p>{row.exemplarGloss ? <><strong>{row.exemplarGloss}</strong> is a plain-language description of the paper’s exemplar, <strong>{row.exemplar}</strong>.</> : <>The paper uses <strong>{row.exemplar}</strong> as this cluster’s exemplar.</>}</p>
    <p>This cluster contains {row.rows.length} research variables in total, including its exemplar. The researchers grouped variables by similarities in their Big Five prediction patterns, not simply by shared subject matter. The cluster name is an interpretive label, not a single measured success scale.</p>
    {row.interpretationNote && <p>{row.interpretationNote}</p>}
    <ResearchPatternChart clusterId={row.numericId} />
    <p className="small">The variables include attitudes, behaviors or outcomes. Mean observed multiple R across them: {row.meanR.toFixed(2)}. This is a study summary, not the accuracy of your match.</p>
    {!isShape && <p className="small">Each row is calculated using its own ordinary regression coefficients. The cluster index averages these rows with equal weight. Elevation + pattern = combined before rounding; the displayed terms may differ by 0.001 due to rounding.</p>}
    <label className="checkbox-label"><input type="checkbox" checked={showWeights} onChange={event => setShowWeights(event.target.checked)} /> {isShape ? 'Show research pattern weights' : 'Show ordinary regression weights'}</label>
    {showWeights && <p className="small">{isShape ? 'β* is a regression coefficient minus the average coefficient for that variable. A negative value means below-average emphasis, not necessarily a negative overall association. Values below are centered again to remove rounding residue.' : 'β is the ordinary regression coefficient reconstructed from the observed correlations. Unlike centered β*, it retains both elevation and pattern information. The reconstruction uses the published rounded predictor matrix.'}</p>}
    <div className="table-scroll" tabIndex="0" role="region" aria-label={`${row.name} research variables`}>
      <table className="variables-table">
        <caption className="sr-only">Research variables associated with {row.name}, ordered by {MODES[mode].column.toLowerCase()}</caption>
        <thead><tr><th scope="col">Research variable · scored direction</th>
          {showWeights && TRAITS.map(trait => <th scope="col" key={trait}>{isShape ? 'β*' : 'β'} {trait}</th>)}
          {isShape ? <th scope="col">Shape similarity</th> : <><th scope="col">Elevation</th><th scope="col">Pattern</th><th scope="col">Combined</th></>}</tr></thead>
        <tbody>{variables.map(variable => <tr key={variable.sourceName}>
          <th scope="row">{variable.name}
            {variable.reverseKeyed && <span className="direction-note">Reverse-keyed in the source · coefficients already reversed</span>}
          </th>
          {showWeights && (isShape ? variable.pattern : variable.beta).map((value, i) => <td key={TRAITS[i]}>{formatScore(value,mode)}</td>)}
          {isShape ? <td>{formatSimilarity(variable.match)}</td> : <><td>{formatScore(variable.elevation,mode)}</td><td>{formatScore(variable.pattern,mode)}</td><td>{formatScore(variable.combined,mode)}</td></>}
        </tr>)}</tbody>
      </table>
    </div>
    <p className="small">{isShape ? 'These are comparisons with associated personality patterns. They are not estimates of your level of loneliness, health, income, performance or any other listed variable.' : 'These are provisional linear model outputs in each criterion’s standardized units, assuming the research associations transfer to your profile. They have not been validated as personal forecasts; they are not probabilities or measured levels of the listed outcomes.'}</p>
  </div>;
}

function MatchResults({ profile, delta, setDelta, mode }) {
  const ranked = useMemo(() => rankForMode(profile,mode), [profile,mode]);
  const sensitivity = useMemo(() => sensitivityForMode(profile,delta,mode), [profile,delta,mode]);
  const isShape = mode === 'shape';
  const bound = isShape ? 1 : Math.max(.1,Math.ceil(Math.max(...ranked.clusters.map(row=>Math.abs(row.score)),...ranked.families.map(row=>Math.abs(row.score)))*10)/10);
  return <>
    <section className="results-section" aria-labelledby="families-heading">
      <div className="section-heading"><div><span className="eyebrow">02 / {MODES[mode].name}</span><h2 id="families-heading">Three families of success</h2></div><span className="scale-label">{MODES[mode].unit}</span></div>
      <p className="section-intro">{isShape ? 'A higher score means a closer relative trait shape. It does not estimate your chance of success, ability or personal values.' : mode === 'elevation' ? 'This view isolates the contribution of your overall trait level to each research index. It excludes your relative trait pattern. A higher contribution is not a higher probability of success.' : 'This index combines elevation and pattern using each research variable’s own regression model, then averages those outputs. Higher means a larger model index, not a greater proven chance of success.'}</p>
      {!isShape && <p className="model-note">Approximate research model · Equal weight per variable · 0 is the model’s reference mean. These are mean criterion SD units, not standard deviations of a validated family or type scale. {profile.status !== 'ready' && 'Your shape has little or no differentiation; the model remains calculable from elevation. An exactly flat profile has zero pattern contribution.'}</p>}
      <div className="family-grid">{ranked.families.map(row => <article className={`family-card ${row.color}`} key={row.id}>
        <div className="card-top"><span className="small">{row.rows.length} research variables</span><strong className="match-value">{formatScore(row.score,mode)}</strong></div>
        <h3>{row.name}</h3><p>{row.gloss}</p>
        <SimilarityBar value={row.score} bound={bound} />
        {mode === 'combined' && <ContributionBreakdown row={row} />}
        {row.rankStart !== row.rankEnd && <span className="tie-label">Same displayed score as another family</span>}
        <ScenarioPosition result={sensitivity.results[row.id]} />
      </article>)}</div>
      <p className="small">{isShape ? 'Each family is a separate comparison with its average research pattern. Your closest type can belong to a different family.' : 'Each family averages all of its member variables directly; it does not give equal weight to unequal-sized types. These heterogeneous indices are not interchangeable measures of success or personal value.'} Fewer possible family labels do not establish greater validity.</p>
    </section>

    <section className="results-section" aria-labelledby="types-heading">
      <div className="section-heading"><div><h2 id="types-heading">Ten forms of success</h2><p className="small">Explore each type to see the research variables behind it.</p></div></div>
      <div className="score-legend">{isShape ? <><span>−1 · opposite shape</span><span>0 · no linear shape alignment</span><span>+1 · same shape</span></> : <><span>−{bound.toFixed(1)}</span><span>0 · reference mean · axis adapts to this profile</span><span>+{bound.toFixed(1)}</span></>}</div>
      <div className="cluster-list">{ranked.clusters.map(row => <details className={`cluster ${row.color}`} key={row.id}>
        <summary>
          <div className="cluster-title"><span><strong>{row.name}</strong><span className="family-tag">{row.meta}</span></span><span className="match-value">{formatScore(row.score,mode)}<span className="expand-marker" aria-hidden="true">+</span></span></div>
          <SimilarityBar value={row.score} bound={bound} />
          {mode === 'combined' && <ContributionBreakdown row={row} />}
          <div className="cluster-subtitle"><span>{row.desc}</span><ScenarioPosition result={sensitivity.results[row.id]} /></div>
          {row.rankStart !== row.rankEnd && <span className="tie-label">Same displayed score · positions {row.rankStart}–{row.rankEnd}</span>}
        </summary>
        <ClusterDetails row={row} z={profile.z} mode={mode} />
      </details>)}</div>
      <p className="small">Scores shown to {isShape ? 'two' : 'three'} decimals are grouped when equal and listed alphabetically within that group. These are display ties, not statistical tests. A low score does not rule out success in that domain.</p>
    </section>

    <section className="sensitivity-panel" aria-labelledby="sensitivity-heading">
      <div className="section-heading"><div><span className="eyebrow">03 / Check sensitivity</span><h2 id="sensitivity-heading">What if your inputs shift?</h2></div>
        <label className="delta-label">Adjustment per trait
          <select value={delta} onChange={event => setDelta(Number(event.target.value))}>
            {[1, 5, 10].map(value => <option key={value} value={value}>±{value} percentile point{value > 1 ? 's' : ''}</option>)}
          </select>
        </label>
      </div>
      <p>“Tested positions” shows how each result’s position changes when each input is decreased by {delta}, unchanged, or increased by {delta} percentile point{delta > 1 ? 's' : ''}, in every combination. All five traits change together in each scenario, so their effects on every match are evaluated together.</p>
      <p className="small">{sensitivity.evaluated} distinct scorable combinations evaluated for {MODES[mode].name.toLowerCase()}, including the entered profile under the tail convention. {sensitivity.omitted > 0 ? `${sensitivity.omitted} additional combinations had too little differentiation and were omitted. ` : ''}The finite grid does not include every value between those steps. The selected adjustment is an exploratory choice, not an estimate of questionnaire error. It does not give retest probabilities or confidence intervals.</p>
      <div className="sensitivity-table-wrap"><table className="sensitivity-table">
        <caption>Range observed in the tested inputs</caption>
        <thead><tr><th scope="col">Type</th><th scope="col">{isShape ? 'Similarity range' : 'Index range'}</th><th scope="col">Positions</th></tr></thead>
        <tbody>{ranked.clusters.map(row => { const result = sensitivity.results[row.id]; return <tr key={row.id}>
          <th scope="row">{row.name}</th><td>{formatScore(result.minScore,mode)} to {formatScore(result.maxScore,mode)}</td>
          <td>{result.bestPosition === result.worstPosition ? result.bestPosition : `${result.bestPosition}–${result.worstPosition}`}</td>
        </tr>; })}</tbody>
      </table></div>
    </section>
  </>;
}

function Method() {
  return <section className="method-page" aria-labelledby="method-heading">
    <span className="eyebrow">The evidence & the interpretation</span>
    <h2 id="method-heading">A research map, used for reflection</h2>
    <p>Wilmot, Wiernik and Ones (2025) synthesized 111 meta-analyses covering 206 variables, representing more than 2.25 million participants and 3,300 studies. They grouped success variables by the personality patterns associated with them. They did not divide people into ten exclusive personality types.</p>
    <p>This explorer uses the 148 variables in the paper’s final ten clusters. Those clusters form three families. The paper also identifies variables with weak personality associations and variables mainly associated with overall trait level; neither group is part of this matching view.</p>
    <h3>How much does personality explain?</h3>
    <table><caption>Study summaries across criteria, from Tables 7–8</caption><thead><tr><th scope="col">Criterion group</th><th scope="col">Mean explained variance</th></tr></thead><tbody>
      <tr><th scope="row">All 204 modeled variables</th><td>8.2%</td></tr><tr><th scope="row">Attitudes</th><td>15.0%</td></tr><tr><th scope="row">Behaviors</th><td>5.0%</td></tr><tr><th scope="row">Outcomes</th><td>2.0%</td></tr>
    </tbody></table>
    <p>These are averages of the reported R² values, not the square of the average correlation. They describe the research models across the broader review. They do not measure this app’s accuracy or your chance of success.</p>
    <p>In the paper’s decomposition, roughly 71% of the variance attributed to personality comes from overall profile level and 29% from profile pattern. Those are research summaries, not weights for mixing the two scores. This app offers pure shape similarity and an approximate linear model with elevation and pattern contributions.</p>

    <h3>What your score means</h3>
    <p>Your domain percentiles are converted to normal-score coordinates, with neuroticism reversed into emotional stability when needed. In Shape similarity, we compute the Pearson correlation across your five coordinates and each cluster’s mean published centered regression-weight vector. The same procedure is applied separately to the three families.</p>
    <div className="formula">similarity = corr(your five normal scores, research pattern)</div>
    <p>A value of +1 means the same relative shape, 0 means no linear alignment of shape, and −1 means opposite shape. This is a comparison across five trait coordinates. It is not a correlation estimated across people, an outcome percentile, a success probability, or a statistical significance test.</p>
    <p>Adding the same amount to all five normal scores, or multiplying their deviations by a positive constant, leaves shape similarity unchanged. Two profiles with different overall trait levels can therefore receive the same shape match. The linear model below retains elevation and the magnitude of trait differences.</p>
    <p>The authors propose individual profile matching as an application. This specific scoring and display implementation has not been independently validated. The evidence is mostly cross-sectional and correlational. Summary statistics can support linear regression estimation, but they do not establish this app’s predictions for new individuals.</p>

    <h3>Elevation and the combined model</h3>
    <p>Your descriptive elevation is the average of the five normal-score coordinates. It is not the average of your input percentiles and is not itself a population-standardized composite. The Elevation contribution view shows how that common level contributes to each research index; the Combined model adds the criterion-specific pattern contribution.</p>
    <p>For each of the 148 variables, we use the observed trait–criterion correlations from the authors’ analysis workbook (INTA, INDV, INTR and INDS sheets, column r) and the observed predictor matrix C from supplemental Table S7. We solve for its ordinary regression coefficients, then decompose its score algebraically:</p>
    <div className="formula">βⱼ = C⁻¹rⱼ<br />elevationⱼ = mean(βⱼ) × sum(z)<br />patternⱼ = (βⱼ − mean(βⱼ)) · z<br />combinedⱼ = elevationⱼ + patternⱼ = βⱼ · z</div>
    <p>The pattern contribution is a weighted linear sum, not the Pearson shape similarity. It retains the magnitude of your trait differences. Elevation and pattern add exactly before rounding. They are not assumed to be statistically independent; no 71/29 weighting or arbitrary blend is used.</p>
    <p>Each type or family index is the equal-weight mean of its constituent criterion scores. Families average all their variables directly, so a small type does not receive the same weight as a larger type. We do not average MACPA component coefficients and apply them to a new standardized centroid.</p>
    <p>Index units are the mean of the constituent criteria’s standardized units. For example, +0.200 is an average model output of +0.200 criterion SD units relative to the model’s zero reference. It is not +0.200 standard deviations on a measured family scale, a percentile, or a success probability. The paper does not provide the criterion intercorrelations needed to standardize the composite. Equal weighting is an explicit app choice; it does not make salary, satisfaction and other criteria equivalent in value.</p>
    <p>This reconstruction is approximate: C is published to two decimal places. Across all 148 variables, the maximum absolute difference from the printed centered weights is below 0.010, and the maximum difference from printed multiple R is below 0.0065. These checks verify numerical correspondence, not personal predictive accuracy. The workbook snapshot, source mapping and audit details are retained with the app.</p>

    <h3>Reading the research weights</h3>
    <p>An ordinary regression coefficient, β, accounts for the other traits. The paper then subtracts the mean coefficient for that variable to obtain β*. For example, β = .20 and mean β = .30 produce β* = −.10, even though the ordinary coefficient is positive. A negative pattern weight means relatively less emphasis; it does not, by itself, mean that the trait harms an outcome.</p>
    <p>Shape similarity retains the published values from Tables 9–11 at two-decimal precision and centers their averages to remove rounding residue. The linear model instead uses the reconstructed ordinary coefficients described above. Twenty-one variables are reverse-keyed in the source; both the published vectors and the workbook’s analysis-sheet correlations are already reversed. Their display labels explicitly describe the lower or reduced direction.</p>

    <h3>Input conventions and sensitivity</h3>
    <p>Use domain percentiles from one questionnaire and its reference group. A percentile is your relative standing among people in that group, not the percentage of questionnaire points you obtained. Percentiles from different instruments or norm groups may not be interchangeable.</p>
    <p>Inverse-normal conversion is an approximation to a questionnaire’s standardized scores. During calculation, all percentiles below 0.5 use 0.5 and all above 99.5 use 99.5. The input values remain visible, and affected traits are flagged. This symmetric tail convention keeps rounded extremes finite and monotonic; it is not an instrument-specific norm.</p>
    <p>Exactly flat profiles have undefined shape similarity. The shape view also pauses ranking when the effective percentiles span {MIN_DISPLAY_SPAN} point or less. That is an explicit display safeguard against tiny differences, not a validated psychometric threshold. Elevation and combined model scores remain defined for flat profiles. At all five 50th percentiles, their scores are zero and all results share a display tie. At equal nonzero normal scores, the pattern contribution is zero but the elevation contributions may differ across models.</p>
    <p>The sensitivity view tests every combination of three chosen values per trait: decreased, unchanged, and increased. Duplicates at the tail limits are removed. In the shape view, profiles that fail the differentiation safeguard are counted and omitted; the linear views include them. Every scenario uses the same changed profile for all matches and the selected scoring mode. Position ranges include ties at the displayed precision: two decimals for similarity, three for the indices.</p>
    <p>These finite scenario ranges are not confidence intervals, population frequencies or retest estimates. They cover input variation only, not uncertainty in the research coefficients, questionnaire validity or the model itself.</p>

    <details className="method-detail"><summary>Research correlation matrix · observed Table S7</summary>
      <p>These are the observed intercorrelations printed in Supplemental Table S7, in ES/AG/CO/EX/OP order. The linear model uses this fixed matrix. Shape correlation does not use it. The app does not accept custom matrices or calculate theoretical population percentiles.</p>
      <div className="table-scroll"><table><caption>Observed Big Five intercorrelations · Table S7</caption><thead><tr><th scope="col">Trait</th>{TRAITS.map(trait => <th scope="col" key={trait}>{trait}</th>)}</tr></thead>
        <tbody>{OBSERVED_S7.map((row, i) => <tr key={TRAITS[i]}><th scope="row">{TRAITS[i]}</th>{row.map((value, j) => <td key={j}>{value.toFixed(2)}</td>)}</tr>)}</tbody></table></div>
    </details>
    <h3>Sources</h3>
    <p>Wilmot, M. P., Wiernik, B. M., & Ones, D. S. (2025). <em>Mapping Domains of Life Success: Insights From Meta-Analytic Criterion Profile Analysis.</em> Psychological Bulletin, 151(6), 767–818.</p>
    <ul className="source-list"><li>{sourceLink(PAPER, 'Research paper')} · definitions, final cluster structure and Tables 9–11.</li><li>{sourceLink(SUPPLEMENT, 'APA supplemental materials')} · observed Table S7 correlations.</li><li>{sourceLink('https://osf.io/d5gqx/', 'Authors’ data and code')} · materials for reproducing the analysis.</li><li>{sourceLink('https://osf.io/zj9n7/', 'Analysis workbook')} · observed criterion correlations; snapshot retrieved 4 September 2026.</li><li>{sourceLink('https://doi.org/10.1037/bul0000504', 'Published correction')} · switches the environment labels in Figure 1; it does not report a change to the numeric cluster profiles.</li></ul>
    <p className="small">The main MACPA and cluster analyses use observed associations. Figure 5 has an inconsistent “corrected” caption; this app follows the methods and observed values in Tables 9–11. It does not claim full-precision reproduction of every figure parameter.</p>
  </section>;
}

export default function App() {
  const [theme, setTheme] = useState(initialTheme);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#15191f' : '#f8fafc');
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Appearance still works for this session when browser storage is unavailable.
    }
  }, [theme]);
  const [fields, setFields] = useState(Array(5).fill(''));
  const [polarity, setPolarity] = useState('ES');
  const [touched, setTouched] = useState(Array(5).fill(false));
  const [example, setExample] = useState(false);
  const [tab, setTab] = useState('profile');
  const [delta, setDelta] = useState(5);
  const [mode, setMode] = useState('shape');
  const profile = useMemo(() => profileFromFields(fields, polarity), [fields, polarity]);
  const names = polarity === 'N' ? ['Neuroticism', ...TRAIT_NAMES.slice(1)] : TRAIT_NAMES;
  const completed = fields.filter(value => !parsePercentile(value).error).length;

  const changeField = (i, value) => { setFields(previous => previous.map((old, j) => i === j ? value : old)); setExample(false); };
  const changePolarity = (next) => { if (next !== polarity) { setFields(previous => [reverseField(previous[0]), ...previous.slice(1)]); setPolarity(next); } };
  const loadExample = () => { setFields(polarity === 'N' ? [reverseField(EXAMPLE[0]), ...EXAMPLE.slice(1)] : [...EXAMPLE]); setTouched(Array(5).fill(false)); setExample(true); };
  const clear = () => { setFields(Array(5).fill('')); setTouched(Array(5).fill(false)); setExample(false); };

  return <div className="app-shell">
    <header className="site-header">
      <a className="wordmark" href="#" onClick={event => { event.preventDefault(); setTab('profile'); }}>
        <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M4 21V15M10 25V8M16 22V4M22 26V12M28 18V7" /></svg>
        <span className="wordmark-name">Life success<span className="wordmark-subtitle">Profile explorer</span></span>
      </a>
      <div className="header-tools"><span className="edition">Research edition · 02</span>
        <button className="theme-toggle" type="button" aria-label="Dark appearance" aria-pressed={theme === 'dark'} onClick={() => setTheme(current => current === 'light' ? 'dark' : 'light')}>
          <svg viewBox="0 0 24 24" aria-hidden="true">{theme === 'light' ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5" /></> : <path d="M20.5 14A8.6 8.6 0 0 1 10 3.5 8.6 8.6 0 1 0 20.5 14Z" />}</svg>
          <span>{theme === 'light' ? 'Light' : 'Dark'}</span>
        </button>
      </div>
    </header>
    <main>
      <div className="hero"><span className="eyebrow">Big Five × forms of success</span><h1>Explore your personality across the forms of success.</h1><p>See what your overall trait level and relative pattern contribute across ten research-derived types and three broader families. Explore both together, or compare them separately.</p></div>
      <nav className="tabs" aria-label="Main views"><button aria-current={tab === 'profile' ? 'page' : undefined} onClick={() => setTab('profile')}>Explore your profile</button><button aria-current={tab === 'method' ? 'page' : undefined} onClick={() => setTab('method')}>Research & method</button></nav>
      {tab === 'method' ? <Method /> : <>
        <section className="input-panel" aria-labelledby="profile-heading">
          <div className="section-heading"><div><span className="eyebrow">01 / Your inputs</span><h2 id="profile-heading">Big Five domain percentiles</h2></div><div className="input-actions"><button className="primary-button" onClick={loadExample}>Load example <span aria-hidden="true">↗</span></button><button className="text-button" onClick={clear}>Clear</button></div></div>
          <p className="section-intro" id="percentile-help">Use the percentiles reported by one questionnaire: 80 means the 80th percentile in its reference group, not 80% of the available test points. Enter all five values from 0 to 100.</p>
          <fieldset className="polarity"><legend>My report uses</legend><label><input type="radio" name="polarity" value="ES" checked={polarity === 'ES'} onChange={() => changePolarity('ES')} /> Emotional stability</label><label><input type="radio" name="polarity" value="N" checked={polarity === 'N'} onChange={() => changePolarity('N')} /> Neuroticism</label></fieldset>
          <p className="small">These are opposite directions. Switching labels reverses the first percentile to preserve the same profile.</p>
          {example && <p className="example-note" role="status">Example profile loaded. Replace these illustrative inputs with your own.</p>}
          <div className="input-grid">{fields.map((text, i) => {
            const parsed = parsePercentile(text);
            const showError = parsed.error && (touched[i] || text.length > 0);
            return <div className="trait-input" key={TRAITS[i]}>
              <label htmlFor={`trait-${TRAITS[i]}`}><span className="trait-code">{i === 0 && polarity === 'N' ? 'N' : TRAITS[i]}</span>{names[i]}</label>
              <div className="number-field"><input id={`trait-${TRAITS[i]}`} type="text" inputMode="decimal" autoComplete="off" value={text} placeholder="—" aria-invalid={Boolean(showError)} aria-describedby={`percentile-help tail-help${showError ? ` error-${TRAITS[i]}` : ''}`}
                onChange={event => changeField(i, event.target.value)} onBlur={() => setTouched(previous => previous.map((old, j) => i === j ? true : old))} /><span>percentile</span></div>
              {showError && <span className="field-error" id={`error-${TRAITS[i]}`}>{parsed.error}</span>}
            </div>;
          })}</div>
          <p className="small" id="tail-help">For calculation, percentiles below 0.5 use 0.5 and those above 99.5 use 99.5. Your entered values remain unchanged. This is an explicit approximation for extreme scores.</p>
          <div className="input-status" role="status">{completed}/5 percentiles entered</div>
          {profile.clipped?.length > 0 && <p className="notice" role="status">Tail convention applied to {profile.clipped.map(i => names[i]).join(', ')}. Your matches use the stated 0.5–99.5 calculation limits.</p>}
          <ProfileElevation profile={profile} />
          {profile.z && <ProfileShape profile={profile} />}
        </section>

        <fieldset className="mode-picker"><legend>Comparison view</legend><div>{Object.entries(MODES).map(([key,value]) => <label className={mode === key ? 'selected' : ''} key={key}><input type="radio" name="comparison" value={key} checked={mode === key} onChange={() => setMode(key)} />{value.name}</label>)}</div><p className="small">Shape compares relative trait resemblance. Elevation isolates overall trait level. Combined adds elevation and the weighted pattern contribution in the research model. Their numerical scales differ.</p></fieldset>

        {profile.z && (mode !== 'shape' || profile.status === 'ready') ? <MatchResults key={mode} profile={profile} delta={delta} setDelta={setDelta} mode={mode} /> : <section className="empty-state" aria-live="polite">
          {profile.status === 'flat' || profile.status === 'near-flat' ? <><span className="empty-symbol" aria-hidden="true">—</span><h2>No differentiated pattern to rank</h2><p>{profile.status === 'flat' ? 'Your five effective scores are equal, so shape similarity is undefined.' : 'Your effective percentiles span one point or less. Tiny differences are not a useful basis for this ranking.'} This says nothing about your capacity for success.</p><p className="small">The one-point pause is a display safeguard, not a validated psychometric threshold. Switch to Elevation contribution or Combined model to see the defined linear scores for this profile.</p></> : <><span className="empty-symbol" aria-hidden="true">01–05</span><h2>{profile.status === 'invalid' ? 'Check the highlighted inputs' : 'Your profile starts here'}</h2><p>{profile.status === 'invalid' ? 'Complete all five fields with valid percentiles before comparing profiles.' : 'Enter all five percentiles, or load the example to explore the research patterns.'}</p></>}
        </section>}
      </>}
    </main>
    <footer><p>Based on Wilmot, Wiernik & Ones (2025) · {VARIABLES.length} research variables · {FAMILIES.length} families</p><p>Your entries stay in this browser tab. The comparisons and approximate model indices are exploratory, not validated personal forecasts.</p></footer>
  </div>;
}
