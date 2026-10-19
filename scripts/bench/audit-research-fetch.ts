/** Independently recompute statistics and audit stored public payloads. No network. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b); const i = Math.floor(s.length / 2);
  return s.length ? s.length % 2 ? s[i]! : (s[i - 1]! + s[i]!) / 2 : null;
};
export function strictPayload(id: string, data: any): boolean {
  const finite = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
  const nonempty = (x: unknown) => typeof x === 'string' && x.length > 0;
  if (id === 'company.profile') return nonempty(data?.name) && nonempty(data?.symbol);
  if (id === 'company.valuation') return !!data && nonempty(data.symbol) && ['pe', 'pb', 'totalMarketValue'].some(k => finite(data[k]));
  if (id === 'company.financials') return !!data && nonempty(data.symbol) && ['IS', 'BS', 'CF'].every(k =>
    Array.isArray(data.statements?.[k]?.indicators) && data.statements[k].indicators.some((i: any) =>
      Array.isArray(i.accounts) && i.accounts.some((a: any) => nonempty(a.field) && Array.isArray(a.values) && a.values.some((v: any) => finite(v.value)))));
  if (id === 'company.ratings') return nonempty(data?.symbol) && (nonempty(data.recommend) || finite(data.target));
  if (id === 'company.earnings') return Array.isArray(data) && data.length > 0 && data.every(x => finite(x.epsMean));
  if (id === 'market.kline') return Array.isArray(data) && data.length >= 2 && data.every(x => finite(x.close) && finite(x.timestamp));
  if (id === 'research.news') return Array.isArray(data) && data.length > 0 && data.every(x => nonempty(x.title) && finite(x.timestamp));
  if (id === 'company.dividends') return Array.isArray(data); // empty is explicitly allowed
  return false; // unknown data never silently passes an audit
}
export function observedConcurrency(traces: Array<{ startedMs: number; finishedMs: number }>) {
  const events = traces.flatMap(t => [{ at: t.startedMs, delta: 1 }, { at: t.finishedMs, delta: -1 }]);
  events.sort((a, b) => a.at - b.at || a.delta - b.delta);
  let active = 0; let peak = 0;
  for (const e of events) { active += e.delta; peak = Math.max(peak, active); }
  return peak;
}
function stat(xs: number[]) { return { n: xs.length, medianMs: median(xs), meanMs: xs.length ? xs.reduce((a,b) => a+b,0)/xs.length : null,
  minMs: xs.length ? Math.min(...xs) : null, maxMs: xs.length ? Math.max(...xs) : null }; }
export function audit(dir: string) {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  const reported = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
  const records = readFileSync(join(dir, 'trials.jsonl'), 'utf8').trim().split('\n').map(s => JSON.parse(s));
  const errors: string[] = []; const payloadFailures: any[] = []; const payloadSeen = new Set<string>();
  const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
  for (const [path, hash] of Object.entries(manifest.sourceHashes)) {
    const p = join(dir, 'source-snapshot', path);
    if (!existsSync(p) || sha256(readFileSync(p, 'utf8')) !== hash) errors.push(`source snapshot mismatch: ${path}`);
  }
  const ids = new Set<string>();
  for (const r of records) {
    if (ids.has(r.trialId)) errors.push(`duplicate trial: ${r.trialId}`); ids.add(r.trialId);
    const capIds = r.traces.map((t: any) => t.capabilityId).sort();
    if (JSON.stringify(capIds) !== JSON.stringify([...r.planned].sort())) errors.push(`capability mismatch: ${r.trialId}`);
    if (observedConcurrency(r.traces) !== r.maxActive || r.maxActive > (r.mode === 'serial' ? 1 : 4)) errors.push(`concurrency mismatch: ${r.trialId}`);
    const span = Math.max(...r.traces.map((t: any) => t.finishedMs)) - Math.min(...r.traces.map((t: any) => t.submittedMs));
    if (r.fetchMs !== null && r.fetchMs + 1 < span) errors.push(`fetch timer shorter than capability span: ${r.trialId}`);
    for (const t of r.traces) {
      if (t.status !== 'success') continue;
      if (!t.payloadFile) { errors.push(`missing payload: ${r.trialId}/${t.capabilityId}`); continue; }
      const raw = readFileSync(join(dir, t.payloadFile), 'utf8');
      if (sha256(raw) !== t.payloadHash) errors.push(`payload hash mismatch: ${r.trialId}/${t.capabilityId}`);
      payloadSeen.add(t.payloadHash);
      if (!strictPayload(t.capabilityId, JSON.parse(raw))) payloadFailures.push({ trialId: r.trialId, capabilityId: t.capabilityId });
    }
  }
  const measured = records.filter(r => !r.warmup); const warmups = records.filter(r => r.warmup);
  const expected = manifest.protocol.repeats * manifest.protocol.cases.length * 2;
  if (measured.length !== expected) errors.push(`expected ${expected} measured runs, found ${measured.length}`);
  if (warmups.length !== manifest.protocol.warmupPairsPerCase * manifest.protocol.cases.length * 2) errors.push('wrong warmup count');
  const pairs: any[] = [];
  for (const c of manifest.protocol.cases) for (let round=1;round<=manifest.protocol.repeats;round++) {
    const rows = measured.filter(r => r.caseId===c.id && r.round===round);
    const serial=rows.find(r=>r.mode==='serial'); const parallel=rows.find(r=>r.mode==='parallel');
    if (rows.length!==2 || !serial || !parallel) { errors.push(`missing pair: ${c.id}/${round}`); continue; }
    const ok=(r:any) => r.status==='completed' && r.semanticPayloadsValid && r.sourceAttributionValid && r.fetchMs>0 && !payloadFailures.some(f=>f.trialId===r.trialId);
    const eligible=ok(serial)&&ok(parallel);
    const fullPayloadMatch=serial.traces.every((s:any)=>parallel.traces.some((p:any)=>p.capabilityId===s.capabilityId&&p.payloadHash===s.payloadHash));
    pairs.push({caseId:c.id, round, eligible, serialMs:serial.fetchMs, parallelMs:parallel.fetchMs,
      reductionPct:eligible?(1-parallel.fetchMs/serial.fetchMs)*100:null, fullPayloadMatch});
  }
  const eligible=pairs.filter(p=>p.eligible); const serial=stat(eligible.map(p=>p.serialMs)); const parallel=stat(eligible.map(p=>p.parallelMs));
  const reductionPct=serial.medianMs&&parallel.medianMs?(1-parallel.medianMs/serial.medianMs)*100:null;
  if (eligible.length!==reported.eligiblePairs || serial.medianMs!==reported.serial.medianMs || parallel.medianMs!==reported.parallel.medianMs) errors.push('summary does not match raw JSONL');
  // Deterministic paired bootstrap, stratified by case (10 observations per case).
  let seed=20261019; const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
  const boot:number[]=[];
  if (eligible.length) for(let k=0;k<10000;k++) {
    const sample=manifest.protocol.cases.flatMap((c:any)=>{
      const ps=eligible.filter(p=>p.caseId===c.id);
      return Array.from({length:ps.length},()=>ps[Math.floor(random()*ps.length)]);
    });
    boot.push((1-median(sample.map((p:any)=>p.parallelMs))!/median(sample.map((p:any)=>p.serialMs))!)*100);
  }
  boot.sort((a,b)=>a-b);
  return { schema:'trail-research-fetch-audit/v1', auditedAt:new Date().toISOString(), errors, payloadFailures,
    measuredRuns:measured.length, warmupRuns:warmups.length, eligiblePairs:eligible.length, uniquePublicPayloads:payloadSeen.size,
    successfulCapabilityCalls:measured.reduce((n,r)=>n+r.traces.filter((t:any)=>t.status==='success').length,0),
    failedCapabilityCalls:measured.reduce((n,r)=>n+r.traces.filter((t:any)=>t.status!=='success').length,0),
    sourceReferencesChecked:measured.reduce((n,r)=>n+r.evidenceCount,0), sourceReferenceChecksAllPassed:measured.every(r=>r.sourceAttributionValid),
    serial, parallel, reductionOfMediansPct:reductionPct, medianPairedReductionPct:median(eligible.map(p=>p.reductionPct)),
    pairedBootstrap95Pct:boot.length?[boot[250],boot[9749]]:null,
    bootstrapMeaning:'10,000 paired resamples, stratified by fixed case; seed 20261019; within-session uncertainty only',
    exactPayloadMatchPairs:eligible.filter(p=>p.fullPayloadMatch).length, pairs,
    perCase:manifest.protocol.cases.map((c:any)=>{
      const ps=eligible.filter(p=>p.caseId===c.id); const s=stat(ps.map(p=>p.serialMs)); const p=stat(ps.map(p=>p.parallelMs));
      return {caseId:c.id,serial:s,parallel:p,reductionOfMediansPct:s.medianMs&&p.medianMs?(1-p.medianMs/s.medianMs)*100:null};
    }),
  };
}
if(import.meta.main){
  const dir=resolve(process.argv[2]??'artifacts/research-fetch-live-20261019'); const result=audit(dir);
  writeFileSync(join(dir,'audit.json'),JSON.stringify(result,null,2));
  const csv=['case_id,round,eligible,serial_ms,parallel_ms,reduction_pct,exact_payload_match',...result.pairs.map(p=>[p.caseId,p.round,p.eligible,p.serialMs,p.parallelMs,p.reductionPct,p.fullPayloadMatch].join(','))].join('\n')+'\n';
  writeFileSync(join(dir,'pairs.csv'),csv);
  console.log(JSON.stringify({...result,pairs:undefined},null,2));
  if(result.errors.length||result.payloadFailures.length)process.exitCode=1;
}
