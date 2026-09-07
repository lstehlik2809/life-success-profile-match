import React, { useId, useState } from 'react';
import { getResearchPattern, formatPatternWeight, describeResearchPattern, PATTERN_VIEWS, PATTERN_SCALE } from './research-patterns.js';

const TICKS = [0.25, 0.125, 0, -0.125, -0.25];
const xPosition = index => 130 + index * 144;
const yPosition = value => 58 + (PATTERN_SCALE.max - value) / (PATTERN_SCALE.max - PATTERN_SCALE.min) * 208;

export default function ResearchPatternChart({ clusterId }) {
  const id = useId();
  const [view, setView] = useState('average');
  const pattern = getResearchPattern(clusterId, view);
  const caption = view === 'average'
    ? `Cluster average · ${pattern.variableCount} research variables · equal weight per variable`
    : `Paper’s exemplar · ${pattern.sourceName}`;
  const valuesText = pattern.points.map(point => `${point.name}: ${formatPatternWeight(point.value)}`).join('; ');

  return <section className="research-pattern" aria-labelledby={`${id}-heading`}>
    <h3 id={`${id}-heading`}>The research pattern behind {pattern.clusterName}</h3>
    <fieldset className="pattern-picker">
      <legend>Research pattern view</legend>
      <div>{Object.entries(PATTERN_VIEWS).map(([value, label]) => <label key={value} className={view === value ? 'selected' : ''}>
        <input type="radio" name={`${id}-pattern-view`} value={value} checked={view === value} onChange={() => setView(value)} />
        {label}
      </label>)}</div>
    </fieldset>
    <figure className="research-pattern-figure">
      <figcaption id={`${id}-caption`} aria-live="polite">
        <strong>{caption}</strong>
        <span>{view === 'average'
          ? 'The app’s mean centered pattern, not the Figure 6 exemplar or an exact reproduction of Figure 5.'
          : 'The specific research variable illustrated for this type in Figure 6, not the whole cluster.'}</span>
      </figcaption>
      <div className="research-chart-scroll" tabIndex="0" role="region" aria-label={`${pattern.clusterName} research chart; scroll horizontally if needed`}>
        <svg viewBox="0 0 800 340" role="img" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}>
          <title id={`${id}-title`}>{`${pattern.clusterName} — ${pattern.label}`}</title>
          <desc id={`${id}-description`}>{caption}. Relative regression weights, β*. {valuesText}. Zero is the mean coefficient, not zero overall association. The same −0.250 to +0.250 scale is used for every type and both views.</desc>
          <text className="research-axis-title" x="64" y="24">Relative regression weight (β*)</text>
          {TICKS.map(value => <g key={value}>
            <line className={value === 0 ? 'research-zero-baseline' : 'research-grid-line'} x1="64" x2="770" y1={yPosition(value)} y2={yPosition(value)} />
            <text className="research-tick" x="53" y={yPosition(value) + 5} textAnchor="end">{formatPatternWeight(value)}</text>
          </g>)}
          <text className="research-zero-label" x="770" y="24" textAnchor="end">Zero · mean coefficient (dashed line)</text>
          <polyline className="research-pattern-line" points={pattern.points.map((point, i) => `${xPosition(i)},${yPosition(point.value)}`).join(' ')} />
          {pattern.points.map((point, i) => <g key={point.trait}>
            <circle className="research-pattern-point" cx={xPosition(i)} cy={yPosition(point.value)} r="5" />
            <text className="research-point-value" x={xPosition(i)} y={yPosition(point.value) + (point.value < 0 ? 24 : -14)} textAnchor="middle">{formatPatternWeight(point.value)}</text>
            <text className="research-trait-label" x={xPosition(i)} y="303" textAnchor="middle">
              {point.trait === 'ES' ? <><tspan x={xPosition(i)}>Emotional</tspan><tspan x={xPosition(i)} dy="19">stability</tspan></> : point.name}
            </text>
          </g>)}
        </svg>
      </div>
      <p className="research-pattern-reading">{describeResearchPattern(pattern.points)}</p>
    </figure>
    <div className="research-pattern-notes">
      <p><strong>How to read it:</strong> β* = a regression coefficient minus the mean of that variable’s five coefficients. Above zero means a regression weight above the variable’s five-trait mean; below zero means a weight below it. These signs do not imply causal effects and do not necessarily mean a positive or negative overall association.</p>
      <p>This is a fixed research pattern, not your profile, required personal trait levels, or success probabilities. It describes shape, not elevation or your complete combined score. Changing this chart does not change your scores.</p>
      <p className="small">Redrawn from the <a href="https://doi.org/10.1037/bul0000476" target="_blank" rel="noreferrer">source paper, Figure 6 (p. 801) and Tables 9–11<span className="sr-only"> (opens in a new tab)</span></a>. Published β* values have two-decimal precision; the small rounding residue is removed by centering again. Three-decimal display helps distinguish averages, not imply greater source precision. All charts share the −0.250 to +0.250 scale. Confidence/error bars are omitted because their numeric values are unavailable here; this is not an exact recreation of the figure’s uncertainty.</p>
    </div>
  </section>;
}
