import { describe, expect, it } from 'bun:test';
import { LongBridgeError } from './errors.ts';
import {
  parseCapitalFlowResponse,
  parseDepthResponse,
  parseInstitutionRatingResponse,
  parseIntradayResponse,
  parseKlineResponse,
  parseMarketTemperatureResponse,
  parseNewsResponse,
  parseQuoteResponse,
} from './parser.ts';

// The CLI marks a value it does not have with an empty string — the captured
// fixtures carry `"date": ""`, `"ratio": ""`, `"yoy": ""`, `"tip": ""`. For a
// required numeric field that marker must not be reported as a real 0.

function quote(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    symbol: 'AAPL.US',
    last_price: 195.5,
    prev_close: 194.25,
    timestamp: 1710000000,
    ...overrides,
  });
}

describe('parseQuoteResponse empty-value markers', () => {
  it('keeps a real CLI 0.30 quote with no source timestamp without inventing one', () => {
    const parsed = parseQuoteResponse(JSON.stringify({ symbol: 'AAPL.US', last: '342.000', prev_close: '342.960', volume: 1234 }));
    expect(parsed.lastPrice).toBe(342);
    expect(parsed.timestamp).toBe(0);
    expect(parsed.change).toBeCloseTo(-0.96);
  });

  it('fails a blank last price instead of reporting 0', () => {
    expect(() => parseQuoteResponse(quote({ last_price: '', last: '' }))).toThrow(LongBridgeError);
    expect(() => parseQuoteResponse(quote({ last_price: '   ' }))).toThrow(LongBridgeError);
  });

  it('fails a blank previous close instead of reporting 0', () => {
    expect(() => parseQuoteResponse(quote({ prev_close: '' }))).toThrow(LongBridgeError);
  });

  it('falls back to the last price for blank open/high/low (never 0)', () => {
    const parsed = parseQuoteResponse(quote({ open: '', high: '', low: '' }));
    expect(parsed.lastPrice).toBe(195.5);
    expect(parsed.open).toBe(195.5);
    expect(parsed.high).toBe(195.5);
    expect(parsed.low).toBe(195.5);
  });

  it('falls back to the computed delta for a blank change/change_ratio', () => {
    const parsed = parseQuoteResponse(quote({ change: '', change_ratio: '' }));
    expect(parsed.change).toBeCloseTo(1.25, 10);
    expect(parsed.changePercent).toBeCloseTo((1.25 / 194.25) * 100, 10);
  });

  it('still treats a blank volume as 0', () => {
    expect(parseQuoteResponse(quote({ volume: '' })).volume).toBe(0);
  });

  it('parses the captured CLI payload (numbers delivered as strings)', () => {
    const captured = JSON.stringify([
      {
        symbol: 'AAPL.US',
        last: '276.830',
        high: '280.630',
        low: '274.860',
        open: '279.655',
        prev_close: '280.140',
        volume: 46668401,
        timestamp: '2026-05-05 12:36:35',
      },
    ]);
    const parsed = parseQuoteResponse(captured);
    expect(parsed.lastPrice).toBe(276.83);
    expect(parsed.open).toBe(279.655);
    expect(parsed.prevClose).toBe(280.14);
    expect(parsed.timestamp).toBe(Math.floor(Date.parse('2026-05-05 12:36:35') / 1000));
  });

  it('treats a whitespace-only optional field as missing, not as 0', () => {
    const parsed = parseQuoteResponse(quote({ high: '   ', low: '\t', volume: '  ' }));
    expect(parsed.high).toBe(195.5);
    expect(parsed.low).toBe(195.5);
    expect(parsed.volume).toBe(0);
  });

  it('does not coerce null/boolean/array values into numbers', () => {
    // Required fields fail closed instead of reporting Number(null) === 0.
    expect(() => parseQuoteResponse(quote({ prev_close: null }))).toThrow(LongBridgeError);
    expect(() => parseQuoteResponse(quote({ prev_close: true }))).toThrow(LongBridgeError);
    expect(() => parseQuoteResponse(quote({ prev_close: [] }))).toThrow(LongBridgeError);
    // Optional fields fall back instead of carrying a coerced value.
    const parsed = parseQuoteResponse(quote({ high: true, low: [], open: null }));
    expect(parsed.high).toBe(195.5);
    expect(parsed.low).toBe(195.5);
    expect(parsed.open).toBe(195.5);
  });

  it('fails a quote with no usable timestamp instead of fabricating the current time', () => {
    expect(() => parseQuoteResponse(quote({ timestamp: '' }))).toThrow(LongBridgeError);
    expect(() => parseQuoteResponse(quote({ timestamp: '   ' }))).toThrow(LongBridgeError);
    expect(() => parseQuoteResponse(quote({ timestamp: 'not-a-date' }))).toThrow(LongBridgeError);
  });

  it('parses epoch seconds delivered as a numeric string', () => {
    // The CLI sends epoch seconds as strings (same shape `toEpochSeconds`
    // already handles for capital-flow/trade payloads).
    const parsed = parseQuoteResponse(quote({ timestamp: '1786492800' }));
    expect(parsed.timestamp).toBe(1786492800);
  });

  it('keeps the documented fallback for garbage optional values', () => {
    // A non-empty non-numeric string is "no value" for optional fields — the
    // documented tradeoff: the quote stays usable, high/low/volume fall back.
    const parsed = parseQuoteResponse(quote({ high: 'abc', volume: 'n/a' }));
    expect(parsed.high).toBe(195.5);
    expect(parsed.volume).toBe(0);
  });
});

describe('other parsers with empty-value markers', () => {
  it('normalizes CLI intraday strings and ISO times with the requested symbol', () => {
    expect(parseIntradayResponse(JSON.stringify([{
      time: '2026-11-13T14:30:00Z', price: '358.700', volume: '396688',
    }]), 'AAPL.US')).toEqual([{
      symbol: 'AAPL.US', timestamp: Date.parse('2026-11-13T14:30:00Z') / 1000,
      price: 358.7, volume: 396688,
    }]);
  });

  it('preserves normalized intraday payloads', () => {
    const tick = { symbol: 'NVDA.US', timestamp: 1786492800, price: 224, volume: 100 };
    expect(parseIntradayResponse(JSON.stringify([tick]), 'AAPL.US')).toEqual([tick]);
  });

  it('rejects intraday data with missing time or unusable numeric fields', () => {
    const tick = { timestamp: 1786492800, price: '224', volume: '100' };
    for (const invalid of [{ timestamp: undefined }, { price: '' }, { volume: null }]) {
      expect(() => parseIntradayResponse(JSON.stringify([{ ...tick, ...invalid }]))).toThrow(LongBridgeError);
    }
  });

  it('omits empty closed-market depth placeholders while retaining real quotes', () => {
    const placeholder = { position: 1, price: '', volume: '0', order_num: 0 };
    const real = { position: 2, price: '356.27', volume: 100, order_num: 1 };
    expect(parseDepthResponse(JSON.stringify({
      symbol: 'AAPL.US', bids: [placeholder, real], asks: [placeholder],
    }))).toEqual({
      symbol: 'AAPL.US',
      bids: [{ position: 2, price: 356.27, volume: 100, orderNum: 1 }], asks: [],
    });
  });

  it('fails blank depth prices instead of reporting 0-price levels', () => {
    const payload = JSON.stringify({
      symbol: 'AAPL.US',
      bids: [{ position: 1, price: '', volume: '100' }],
      asks: [],
    });
    expect(() => parseDepthResponse(payload)).toThrow(LongBridgeError);
  });

  it('keeps blank capital-flow buckets at 0', () => {
    const flow = parseCapitalFlowResponse(
      JSON.stringify({
        symbol: 'AAPL.US',
        timestamp: 1710000000,
        capital_in: { large: '', medium: '', small: '' },
        capital_out: { large: '', medium: '', small: '' },
      })
    );
    expect(flow.capitalIn).toEqual({ large: 0, medium: 0, small: 0 });
    expect(flow.capitalOut).toEqual({ large: 0, medium: 0, small: 0 });
  });

  it('keeps blank rating counts at 0', () => {
    const rating = parseInstitutionRatingResponse(
      JSON.stringify({ analyst: { evaluate: { buy: '', hold: '', sell: '', total: '' } } }),
      'AAPL.US'
    );
    expect(rating.analyst?.distribution).toMatchObject({ buy: 0, hold: 0, sell: 0, total: 0 });
  });

  it('keeps missing market-temperature fields at 0', () => {
    const temp = parseMarketTemperatureResponse(
      JSON.stringify([{ field: 'Market', value: 'US' }])
    );
    expect(temp.temperature).toBe(0);
    expect(temp.valuation).toBe(0);
    expect(temp.sentiment).toBe(0);
  });

  it('fails a kline without a timestamp instead of stamping it "now"', () => {
    const payload = JSON.stringify([{ open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }]);
    expect(() => parseKlineResponse(payload)).toThrow(LongBridgeError);
  });

  it('keeps the "now" fallback for a dateless news item instead of failing the feed', () => {
    const news = parseNewsResponse(
      JSON.stringify([{ id: 1, title: 'headline', published_at: '' }])
    );
    expect(news[0]?.timestamp).toBeGreaterThan(0);
  });
});
