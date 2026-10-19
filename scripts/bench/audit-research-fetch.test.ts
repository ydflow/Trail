import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { median, observedConcurrency, strictPayload } from './audit-research-fetch.ts';
describe('benchmark evidence validation',()=>{
  it('calculates odd/even medians without reordering raw input',()=>{
    const xs=[9,1,4]; expect(median(xs)).toBe(4); expect(xs).toEqual([9,1,4]); expect(median([2,8])).toBe(5); expect(median([])).toBeNull();
  });
  it('rejects financial statement shells without numeric financial data',()=>{
    expect(strictPayload('company.financials',{symbol:'AAPL.US',statements:{IS:{},BS:{},CF:{}}})).toBe(false);
    const statement={indicators:[{accounts:[{field:'Revenue',values:[{value:100}]}]}]};
    expect(strictPayload('company.financials',{symbol:'AAPL.US',statements:{IS:statement,BS:statement,CF:statement}})).toBe(true);
  });
  it('rejects empty news/forecasts and unrecognized payloads',()=>{
    expect(strictPayload('research.news',[])).toBe(false);expect(strictPayload('company.earnings',[])).toBe(false);
    expect(strictPayload('company.earnings',[{epsMean:'12'}])).toBe(false);
    expect(strictPayload('company.dividends',[])).toBe(true);expect(strictPayload('unknown',{})).toBe(false);
  });
  it('recomputes overlap rather than trusting a claimed concurrency number',()=>{
    expect(observedConcurrency([{startedMs:0,finishedMs:2},{startedMs:1,finishedMs:3}])).toBe(2);
    expect(observedConcurrency([{startedMs:0,finishedMs:2},{startedMs:2,finishedMs:3}])).toBe(1);
  });
  it('reproduces the published metric from every committed pair',()=>{
    const dir=resolve(import.meta.dir,'../../docs/benchmarks/evidence/2026-10-19');
    const rows=readFileSync(resolve(dir,'pairs.csv'),'utf8').trim().split(/\r?\n/).slice(1).map(line=>line.split(','));
    expect(rows).toHaveLength(30);
    expect(rows.every(row=>row[2]==='true'&&row[6]==='true')).toBe(true);
    const serial=median(rows.map(row=>Number(row[3])))!;
    const parallel=median(rows.map(row=>Number(row[4])))!;
    expect(serial).toBeCloseTo(4540.24945,5);
    expect(parallel).toBeCloseTo(1344.1344,5);
    expect((1-parallel/serial)*100).toBeCloseTo(70.3951420554655,8);
    const raw=readFileSync(resolve(dir,'trials.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
    expect(raw.filter(row=>!row.warmup)).toHaveLength(60);
    expect(raw.filter(row=>!row.warmup).reduce((n,row)=>n+row.traces.length,0)).toBe(220);
  });
  it('keeps the complete original evidence archive byte-identical',()=>{
    const path=resolve(import.meta.dir,'../../docs/benchmarks/evidence/2026-10-19/Trail-20261019-evidence.zip');
    expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe('911cad12785451b02016d7c9d4adaf3f44471a421702b6ccd42c74ee5e2ae437');
  });
});
