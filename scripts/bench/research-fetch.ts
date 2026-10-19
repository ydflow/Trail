/** Trail-only, read-only live retrieval benchmark. No model or broker calls. */
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { cpus, platform, release, arch, totalmem } from 'node:os';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { InstrumentResolver, DEFAULT_INSTRUMENT_CATALOG, type FinanceCapability, type ResearchSynthesisInput, type StrategyId } from '@finagent/core';
import { createFullRegistry, CapabilityExecutor, type RunOptions, type RunOutcome } from '../../packages/shared/src/capabilities/index.ts';
import { ResearchRunner } from '../../packages/shared/src/research/runner.ts';
import { LocalResearchSynthesizer } from '../../packages/shared/src/research/synthesizer-local.ts';
import { ProviderRouter } from '../../packages/shared/src/providers/router.ts';
import { createRouterFetchers } from '../../packages/shared/src/providers/router-fetchers.ts';
import { LongbridgeFinancialDataProvider } from '../../packages/shared/src/providers/longbridge/index.ts';

const root = resolve(import.meta.dir, '../..');
const args = process.argv.slice(2);
function arg(name: string, fallback: string) { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]!; }
const out = resolve(root, arg('--out', `artifacts/research-fetch-${new Date().toISOString().replace(/[:.]/g, '-')}`));
if (existsSync(join(out, 'manifest.json'))) throw new Error('Use a new --out directory; existing evidence is never overwritten.');
mkdirSync(out, { recursive: true });
const preflight = args.includes('--preflight');
const repeats = Number(arg('--repeats', '10'));
const cooldownMs = Number(arg('--cooldown-ms', '2000'));
if (!Number.isInteger(repeats) || repeats < 1 || !Number.isFinite(cooldownMs) || cooldownMs < 0) throw new Error('Invalid benchmark options.');
const cases: Array<{ id: string; symbol: string; strategyId: StrategyId }> = preflight
  ? [{ id: 'preflight-comprehensive-NVDA', symbol: 'NVDA.US', strategyId: 'comprehensive' }]
  : [
      { id: 'value-AAPL', symbol: 'AAPL.US', strategyId: 'value' },
      { id: 'risk-review-NVDA', symbol: 'NVDA.US', strategyId: 'risk-review' },
      { id: 'growth-MSFT', symbol: 'MSFT.US', strategyId: 'growth' },
    ];
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const sourcePaths = [
  'packages/shared/src/research/runner.ts', 'packages/shared/src/research/planner.ts',
  'packages/shared/src/capabilities/executor.ts', 'packages/shared/src/strategies/presets.ts',
  'packages/shared/src/providers/router.ts', 'packages/shared/src/providers/router-fetchers.ts',
  'packages/shared/src/providers/longbridge/adapter.ts', 'scripts/bench/research-fetch.ts',
];
const manifest = {
  schema: 'trail-research-fetch/v1', startedAt: new Date().toISOString(), project: 'Trail',
  head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  trackedChangesAtStart: execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  environment: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model,
    logicalCpus: cpus().length, totalMemoryGiB: totalmem() / 1024 ** 3, bun: Bun.version, node: process.version,
    longbridge: execFileSync('longbridge', ['--version'], { encoding: 'utf8' }).trim(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
  sourceHashes: Object.fromEntries(sourcePaths.map(p => [p, sha256(readFileSync(join(root, p), 'utf8'))])),
  protocol: {
    preflight, repeats: preflight ? 1 : repeats, warmupPairsPerCase: preflight ? 0 : 1, cooldownMs, cases,
    primaryMetric: 'monotonic time from fetching status callback to synthesizing status callback; ms',
    comparison: 'unchanged ResearchRunner: FIFO-gated CapabilityExecutor (one active call) vs native worker pool (four)',
    baselineIsHistoricalVersion: false, provider: 'Longbridge only via production ProviderRouter/createRouterFetchers',
    appCache: 'disabled (router default; no MarketDataService cache)', providerCache: 'uncontrolled/unknown',
    retries: 'none (router default one attempt)', capabilityTimeoutMs: 20000,
    synthesis: 'local deterministic synthesizer AFTER primary timing; no remote LLM',
    excluded: ['Electron/UI', 'model planning', 'LLM synthesis', 'durable checkpoint IO', 'broker/private account calls'],
    order: 'alternate serial/parallel order by (round + caseIndex) parity; rotate case order each round',
    eligibility: 'only matched pairs where BOTH runs and all capabilities succeed AND all semantic payload checks pass',
    failures: 'every attempt retained; no retries, replacement, or selective deletion',
    payloadStorage: 'public normalized data snapshots stored for equivalence audit; no auth/status output or account data',
    caseSelection: 'Before paired measurement: comprehensive NVDA preflight failed market.intraday and research.events. Chose value/risk-review/growth presets using available capabilities; failures remain in separate preflight artifacts. No full-comprehensive or event-driven success claim.',
  },
};
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
for (const path of sourcePaths) {
  const target = join(out, 'source-snapshot', path);
  mkdirSync(resolve(target, '..'), { recursive: true });
  writeFileSync(target, readFileSync(join(root, path), 'utf8'));
}

function stable(x: any): any {
  if (Array.isArray(x)) return x.map(stable);
  if (x && typeof x === 'object') return Object.fromEntries(Object.keys(x).sort().map(k => [k, stable(x[k])]));
  return x;
}
function checkPayload(id: string, x: any): boolean {
  if (x === null || x === undefined) return false;
  if (id === 'company.profile') return typeof x.name === 'string' && x.name.length > 0 && typeof x.symbol === 'string';
  if (id === 'company.valuation') return ['pe', 'pb', 'totalMarketValue'].some(k => typeof x[k] === 'number' && Number.isFinite(x[k]));
  if (id === 'company.financials') return !!x.statements && Object.keys(x.statements).length > 0;
  if (id === 'company.ratings') return !!x.recommend || typeof x.target === 'number';
  if (['market.kline', 'market.intraday', 'market.trades', 'research.news'].includes(id)) return Array.isArray(x) && x.length > 0;
  if (['company.dividends', 'company.earnings', 'research.events'].includes(id)) return Array.isArray(x); // empty can be legitimate; record it explicitly
  return typeof x === 'object';
}
type Trace = { capabilityId: string; submittedMs: number; startedMs: number; finishedMs: number; durationMs: number;
  status: string; error?: string; payloadHash?: string; payloadFile?: string; payloadValid: boolean; emptyArray?: boolean };
class ObservedExecutor extends CapabilityExecutor {
  traces: Trace[] = [];
  payloads: Array<{ trace: Trace; data: unknown }> = [];
  active = 0;
  maxActive = 0;
  private tail: Promise<void> = Promise.resolve();
  constructor(private serial: boolean) { super(); }
  override async run(cap: FinanceCapability, input: unknown, options: RunOptions = {}): Promise<RunOutcome> {
    if (cap.riskLevel !== 'read' || cap.auth !== 'public' || cap.id.startsWith('portfolio.')) throw new Error('Public read-only capabilities only.');
    const submittedMs = performance.now();
    let unlock: (() => void) | undefined;
    if (this.serial) {
      const prior = this.tail;
      this.tail = new Promise<void>(r => { unlock = r; });
      await prior;
    }
    const startedMs = performance.now();
    this.active += 1; this.maxActive = Math.max(this.maxActive, this.active);
    try {
      const outcome = await super.run(cap, input, options);
      const finishedMs = performance.now();
      const trace: Trace = { capabilityId: cap.id, submittedMs, startedMs, finishedMs, durationMs: finishedMs - startedMs,
        status: outcome.record.status, ...(outcome.record.error ? { error: outcome.record.error } : {}),
        payloadValid: false };
      this.traces.push(trace); this.payloads.push({ trace, data: outcome.result?.data });
      return outcome;
    } finally { this.active -= 1; unlock?.(); }
  }
}
mkdirSync(join(out, 'payloads'), { recursive: true });
const records: any[] = [];
async function trial(c: typeof cases[number], mode: 'serial' | 'parallel', round: number, warmup: boolean) {
  const trialId = `${warmup ? 'warmup' : 'measure'}-${round}-${c.id}-${mode}`;
  const router = new ProviderRouter();
  router.register(new LongbridgeFinancialDataProvider());
  router.setRouting({ primary: 'longbridge' });
  const resolver = new InstrumentResolver(DEFAULT_INSTRUMENT_CATALOG);
  const registry = createFullRegistry(createRouterFetchers(router, { resolve: (q, opts) => resolver.resolve(q, opts) }));
  const executor = new ObservedExecutor(mode === 'serial');
  let fetchStart = 0; let fetchEnd = 0; let synthesisInput: ResearchSynthesisInput | undefined;
  const local = new LocalResearchSynthesizer();
  const runner = new ResearchRunner({ registry, executor, synthesizer: { async synthesize(input, signal) {
    synthesisInput = input; return local.synthesize(input, signal);
  } } });
  const startedAt = new Date().toISOString(); const start = performance.now();
  let result: Awaited<ReturnType<ResearchRunner['run']>> | undefined; let exception: string | undefined;
  try { result = await runner.run({ symbol: c.symbol, strategyId: c.strategyId, runId: randomUUID(), locale: 'en-US',
    onStatus(s) { if (s.status === 'fetching') fetchStart = performance.now(); if (s.status === 'synthesizing') fetchEnd = performance.now(); },
  }); } catch (e) { exception = e instanceof Error ? e.message : String(e); }
  const wallMs = performance.now() - start;
  // Disk writes, semantic checks and hashing happen only AFTER the timed runner.
  for (const { trace, data } of executor.payloads) {
    const payload = data === undefined ? undefined : JSON.stringify(stable(data));
    if (payload !== undefined) {
      trace.payloadHash = sha256(payload); trace.payloadFile = `payloads/${trace.payloadHash}.json`;
      if (!existsSync(join(out, trace.payloadFile))) writeFileSync(join(out, trace.payloadFile), payload);
    }
    trace.payloadValid = trace.status === 'success' && checkPayload(trace.capabilityId, data);
    if (Array.isArray(data)) trace.emptyArray = data.length === 0;
  }
  const runs = result?.report?.capabilityRuns ?? [];
  const evidence = result?.report?.sections.flatMap(s => s.evidence) ?? [];
  const knownRunIds = new Set(runs.map(r => r.runId));
  const planned = result?.summary.plannedCapabilities ?? [];
  const record = { trialId, startedAt, caseId: c.id, symbol: c.symbol, strategyId: c.strategyId, round, warmup, mode,
    fetchMs: fetchEnd > fetchStart && fetchStart > 0 ? fetchEnd - fetchStart : null, wallMs, status: result?.summary.status ?? 'exception', exception,
    planned, completed: result?.summary.completedCapabilities ?? [], failed: result?.summary.failedCapabilities ?? [],
    maxActive: executor.maxActive, traces: executor.traces,
    semanticPayloadsValid: executor.traces.length === planned.length && executor.traces.every(t => t.payloadValid),
    sourceAttributionValid: evidence.length === planned.length && evidence.every(e => knownRunIds.has(e.runId) && runs.some(r => r.runId === e.runId && r.capabilityId === e.capabilityId && r.status === 'success')),
    evidenceCount: evidence.length, sectionCount: result?.report?.sections.length ?? 0,
    synthesisInput: synthesisInput ? { plannedCapabilities: synthesisInput.plannedCapabilities,
      bundleCapabilityIds: Object.keys(JSON.parse(synthesisInput.dataBundle)) } : undefined,
  };
  records.push(record); appendFileSync(join(out, 'trials.jsonl'), JSON.stringify(record) + '\n');
  console.log(`${trialId}: ${record.status}; fetch=${record.fetchMs?.toFixed(1)}ms; ${record.completed.length}/${planned.length}; valid=${record.semanticPayloadsValid}; maxActive=${record.maxActive}`);
  for (const t of executor.traces) if (t.status !== 'success' || !t.payloadValid) console.log(`  ${t.capabilityId}: ${t.status}; valid=${t.payloadValid}; ${t.error ?? ''}`);
  await Bun.sleep(cooldownMs);
}
const median = (xs: number[]) => { const s = [...xs].sort((a,b) => a-b); const m = Math.floor(s.length/2); return s.length ? s.length%2 ? s[m]! : (s[m-1]!+s[m]!)/2 : null; };
function stats(xs: number[]) { return { n: xs.length, medianMs: median(xs), meanMs: xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null, minMs: xs.length ? Math.min(...xs) : null, maxMs: xs.length ? Math.max(...xs) : null }; }
function summarize() {
  const measured = records.filter(r => !r.warmup);
  const pairs = cases.flatMap(c => Array.from({ length: preflight ? 1 : repeats }, (_, i) => {
    const round = i + 1; const both = measured.filter(r => r.caseId === c.id && r.round === round);
    const serial = both.find(r => r.mode === 'serial'); const parallel = both.find(r => r.mode === 'parallel');
    const eligible = [serial, parallel].every(r => r?.status === 'completed' && r.semanticPayloadsValid && r.sourceAttributionValid && r.fetchMs !== null);
    const samePayloadCapabilities = serial && parallel ? serial.traces.filter((s: Trace) => parallel.traces.some((p: Trace) => p.capabilityId === s.capabilityId && p.payloadHash === s.payloadHash)).map((t: Trace) => t.capabilityId) : [];
    return { caseId: c.id, round, eligible, serialMs: serial?.fetchMs ?? null, parallelMs: parallel?.fetchMs ?? null,
      reductionPct: eligible ? (1-parallel.fetchMs/serial.fetchMs)*100 : null, samePayloadCapabilities,
      fullPayloadMatch: !!serial && !!parallel && samePayloadCapabilities.length === serial.planned.length };
  }));
  const eligible = pairs.filter(p=>p.eligible);
  const serialStats = stats(eligible.map(p=>p.serialMs as number)); const parallelStats = stats(eligible.map(p=>p.parallelMs as number));
  const summary = { finishedAt: new Date().toISOString(), measuredRuns: measured.length, warmupRuns: records.length-measured.length,
    completedRuns: measured.filter(r=>r.status==='completed').length, semanticValidRuns: measured.filter(r=>r.semanticPayloadsValid).length,
    failureRuns: measured.filter(r=>r.status!=='completed').length, eligiblePairs: eligible.length, pairs,
    serial: serialStats, parallel: parallelStats,
    reductionOfMediansPct: serialStats.medianMs && parallelStats.medianMs ? (1-parallelStats.medianMs/serialStats.medianMs)*100 : null,
    medianPairedReductionPct: median(eligible.map(p=>p.reductionPct as number)),
    perCase: cases.map(c=> { const ps=eligible.filter(p=>p.caseId===c.id); const s=stats(ps.map(p=>p.serialMs as number)); const p=stats(ps.map(p=>p.parallelMs as number));
      return { caseId:c.id, eligiblePairs:ps.length, serial:s, parallel:p, reductionOfMediansPct:s.medianMs&&p.medianMs?(1-p.medianMs/s.medianMs)*100:null }; }),
    allAttemptsStatus: Object.fromEntries(['serial','parallel'].map(mode=>[mode, measured.filter(r=>r.mode===mode).reduce((a:Record<string,number>,r)=>{a[r.status]=(a[r.status]??0)+1;return a;},{})])),
  };
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2));
  return summary;
}
try {
  if (preflight) { await trial(cases[0]!, 'parallel', 1, false); }
  else {
    for (let i=0;i<cases.length;i++) for (const mode of (i%2 ? ['parallel','serial'] : ['serial','parallel']) as Array<'serial'|'parallel'>) await trial(cases[i]!,mode,0,true);
    for (let round=1;round<=repeats;round++) for (let offset=0;offset<cases.length;offset++) {
      const index=(offset+round-1)%cases.length; const c=cases[index]!;
      for (const mode of ((round+index)%2 ? ['parallel','serial'] : ['serial','parallel']) as Array<'serial'|'parallel'>) await trial(c,mode,round,false);
    }
  }
} finally {
  const s=summarize();
  console.log(JSON.stringify({ out, measuredRuns:s.measuredRuns, eligiblePairs:s.eligiblePairs, serial:s.serial, parallel:s.parallel, reductionOfMediansPct:s.reductionOfMediansPct },null,2));
  if (preflight ? s.completedRuns !== 1 : s.eligiblePairs !== repeats * cases.length) process.exitCode = 1;
}
