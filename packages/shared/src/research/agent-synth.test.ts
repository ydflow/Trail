import { describe, expect, it } from 'bun:test';
import type { ResearchSynthesis, ResearchSynthesisInput } from '@finagent/core';
import { createAgentSynthesizer, parseSynthesisJson } from './agent-synth.ts';

const VALID: ResearchSynthesis = {
  summary: 'Neutral outlook.',
  stance: 'neutral',
  confidence: 0.6,
  sections: [
    {
      key: 'market.quote',
      title: 'Price Momentum',
      verdict: 'positive',
      summary: 'Momentum positive.',
    },
  ],
  bullCase: ['Momentum favorable.'],
  bearCase: [],
  catalysts: [],
  risks: [],
};

function synthesisInput(): ResearchSynthesisInput {
  return {
    symbol: 'NVDA.US',
    plannedCapabilities: ['market.quote'],
    runs: [{ capabilityId: 'market.quote', status: 'success' }],
    dataBundle: JSON.stringify({ 'market.quote': { change: 5 } }),
  };
}

describe('parseSynthesisJson', () => {
  it('parses raw JSON', () => {
    expect(parseSynthesisJson(JSON.stringify(VALID))).toEqual(VALID);
  });

  it('parses a fenced json block', () => {
    const fenced = `Here is my analysis:\n\`\`\`json\n${JSON.stringify(VALID)}\n\`\`\``;
    expect(parseSynthesisJson(fenced)).toEqual(VALID);
  });

  it('clamps confidence into 0..1', () => {
    expect(parseSynthesisJson(JSON.stringify({ ...VALID, confidence: 5 })).confidence).toBe(1);
  });

  it('throws SYNTHESIS_PARSE_ERROR on malformed input', () => {
    expect(() => parseSynthesisJson('not json at all')).toThrow();
    expect(() => parseSynthesisJson(JSON.stringify({ ...VALID, stance: 'apocalyptic' }))).toThrow();
    expect(() => parseSynthesisJson(JSON.stringify({ ...VALID, sections: [{}] }))).toThrow();

    try {
      parseSynthesisJson('garbage');
    } catch (error) {
      expect((error as { code: string }).code).toBe('SYNTHESIS_PARSE_ERROR');
    }
  });
});

describe('createAgentSynthesizer', () => {
  it('delegates to the agent runner when it succeeds', async () => {
    const synthesizer = createAgentSynthesizer(async () => ({ ...VALID, stance: 'bullish' }));
    const synthesis = await synthesizer.synthesize(synthesisInput());
    expect(synthesis.stance).toBe('bullish');
  });

  it('degrades to the local synthesizer when the runner throws', async () => {
    const synthesizer = createAgentSynthesizer(async () => {
      throw new Error('agent kernel down');
    });
    const synthesis = await synthesizer.synthesize(synthesisInput());
    // Local synthesizer derives momentum from the quote change (+5).
    expect(synthesis.stance).toBe('bullish');
    expect(synthesis.sections[0].verdict).toBe('positive');
  });
  it('discloses local fallback and retains the model failure for diagnostics', async () => {
    const failure = new Error('model unavailable');
    const seen: unknown[] = [];
    const synthesizer = createAgentSynthesizer(async () => { throw failure; }, { onFallback: (error) => { seen.push(error); } });
    const synthesis = await synthesizer.synthesize(synthesisInput());
    expect(synthesis.summary).toContain('local rules');
    expect(synthesis.risks[0]).toContain('Model synthesis unavailable');
    expect(seen).toEqual([failure]);
  });

  it('does not turn user cancellation into a fallback report', async () => {
    const controller = new AbortController();
    const failure = new Error('user cancelled');
    let fellBack = false;
    const synthesizer = createAgentSynthesizer(async () => {
      controller.abort(failure);
      throw failure;
    }, { onFallback: () => { fellBack = true; } });
    await expect(synthesizer.synthesize(synthesisInput(), controller.signal)).rejects.toBe(failure);
    expect(fellBack).toBe(false);
  });

});
