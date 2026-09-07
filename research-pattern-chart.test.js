import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('R2/R3: server-rendered research charts expose default views, unique native controls, values and caveats', async t => {
  const server = await createServer({
    configFile: false,
    server: { middlewareMode: true, watch: null, hmr: false },
    appType: 'custom',
  });
  try {
    const { default: ResearchPatternChart } = await server.ssrLoadModule('/ResearchPatternChart.jsx');
    const render = clusterId => renderToStaticMarkup(React.createElement(ResearchPatternChart, { clusterId }));

    await t.test('all ten types have five-point charts, full text alternatives, and the shared zero baseline', () => {
      const counts = [14, 15, 4, 14, 22, 11, 21, 15, 20, 12];
      for (let id = 1; id <= 10; id++) {
        const markup = render(id);
        assert.match(markup, new RegExp(`Cluster average · ${counts[id - 1]} research variables · equal weight per variable`));
        assert.equal([...markup.matchAll(/<circle\b/g)].length, 5);
        assert.equal([...markup.matchAll(/<polyline\b/g)].length, 1);
        assert.match(markup, /class="research-zero-baseline"/);
        assert.match(markup, /Zero · mean coefficient/);
        assert.match(markup, /−0.250 to \+0.250/);
        for (const trait of ['Emotional stability', 'Agreeableness', 'Conscientiousness', 'Extraversion', 'Openness']) assert.ok(markup.includes(trait));
        assert.match(markup, /<svg[^>]*role="img"[^>]*aria-labelledby="[^"]+"[^>]*aria-describedby="[^"]+"/);
        assert.match(markup, /<title id="[^"]+">[^<]+ — Cluster average<\/title>/);
        assert.match(markup, /<desc id="[^"]+">[^<]+Relative regression weights, β\*/);
      }
      const ingenuity = render(7);
      for (const value of ['−0.027', '−0.084', '+0.019', '+0.016', '+0.077']) assert.ok(ingenuity.includes(value), value);
    });

    await t.test('separate instances have independent radio group names and unique accessibility IDs', () => {
      const markup = renderToStaticMarkup(React.createElement(React.Fragment, null,
        ...[1, 7, 7, 10].map((clusterId, key) => React.createElement(ResearchPatternChart, { clusterId, key }))));
      const inputs = [...markup.matchAll(/<input\b[^>]+>/g)].map(match => match[0]);
      assert.equal(inputs.length, 8);
      const names = inputs.map(input => input.match(/name="([^"]+)"/)[1]);
      assert.equal(new Set(names).size, 4);
      for (const name of new Set(names)) {
        const group = inputs.filter(input => input.includes(`name="${name}"`));
        assert.equal(group.length, 2);
        assert.ok(group.every(input => input.includes('type="radio"')));
        assert.ok(group.find(input => input.includes('value="average"')).includes('checked=""'));
        assert.ok(!group.find(input => input.includes('value="exemplar"')).includes('checked=""'));
      }
      const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
      assert.equal(new Set(ids).size, ids.length);
      const refs = [...markup.matchAll(/aria-(?:labelledby|describedby)="([^"]+)"/g)].flatMap(match => match[1].split(' '));
      for (const ref of refs) assert.ok(ids.includes(ref), ref);
      assert.equal([...markup.matchAll(/<legend>Research pattern view<\/legend>/g)].length, 4);
    });

    await t.test('chart caveats distinguish sources, weighting, personal scores, precision and uncertainty', () => {
      const markup = render(7);
      for (const text of [
        'not the Figure 6 exemplar or an exact reproduction of Figure 5',
        'β* = a regression coefficient minus the mean',
        'These signs do not imply causal effects',
        'do not necessarily mean a positive or negative overall association',
        'fixed research pattern, not your profile',
        'required personal trait levels, or success probabilities',
        'It describes shape, not elevation or your complete combined score',
        'does not change your scores',
        'small rounding residue is removed',
        'not imply greater source precision',
        'Confidence/error bars are omitted because their numeric values are unavailable here',
        'Figure 6 (p. 801) and Tables 9–11',
      ]) assert.ok(markup.includes(text), text);
      assert.match(markup, /href="https:\/\/doi.org\/10.1037\/bul0000476"/);
      assert.match(markup, /class="research-chart-scroll" tabindex="0" role="region"/);
    });
  } finally {
    await server.close();
  }
});
