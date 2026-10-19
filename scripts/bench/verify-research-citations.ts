/** Extra live correctness evidence, deliberately excluded from latency statistics. */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { InstrumentResolver, DEFAULT_INSTRUMENT_CATALOG, type FinanceCapability, type StrategyId } from '@finagent/core';
import { createFullRegistry, CapabilityExecutor, type RunOptions, type RunOutcome } from '../../packages/shared/src/capabilities/index.ts';
import { ResearchRunner } from '../../packages/shared/src/research/runner.ts';
import { LocalResearchSynthesizer } from '../../packages/shared/src/research/synthesizer-local.ts';
import { ProviderRouter } from '../../packages/shared/src/providers/router.ts';
import { createRouterFetchers } from '../../packages/shared/src/providers/router-fetchers.ts';
import { LongbridgeFinancialDataProvider } from '../../packages/shared/src/providers/longbridge/index.ts';
import { strictPayload } from './audit-research-fetch.ts';

const out=resolve(process.argv[2]??'artifacts/research-fetch-correctness-20261019');
if(existsSync(out))throw new Error('Use a fresh output directory.');
mkdirSync(out,{recursive:true});
const cases:Array<{id:string;symbol:string;strategyId:StrategyId}>=[
  {id:'value-AAPL',symbol:'AAPL.US',strategyId:'value'},
  {id:'risk-review-NVDA',symbol:'NVDA.US',strategyId:'risk-review'},
  {id:'growth-MSFT',symbol:'MSFT.US',strategyId:'growth'},
];
class CapturingExecutor extends CapabilityExecutor{
  outcomes:RunOutcome[]=[];
  override async run(cap:FinanceCapability,input:unknown,options:RunOptions={}){
    if(cap.riskLevel!=='read'||cap.auth!=='public'||cap.id.startsWith('portfolio.'))throw new Error('Only public read-only data allowed.');
    const outcome=await super.run(cap,input,options);this.outcomes.push(outcome);return outcome;
  }
}
const checks:any[]=[];
for(const c of cases){
  const router=new ProviderRouter();router.register(new LongbridgeFinancialDataProvider());router.setRouting({primary:'longbridge'});
  const resolver=new InstrumentResolver(DEFAULT_INSTRUMENT_CATALOG);
  const registry=createFullRegistry(createRouterFetchers(router,{resolve:(q,o)=>resolver.resolve(q,o)}));
  const executor=new CapturingExecutor();const local=new LocalResearchSynthesizer();let synthesisInput:unknown;
  const runner=new ResearchRunner({registry,executor,synthesizer:{async synthesize(input,signal){synthesisInput=input;return local.synthesize(input,signal);}}});
  const statuses:any[]=[];
  const result=await runner.run({symbol:c.symbol,strategyId:c.strategyId,runId:randomUUID(),locale:'en-US',onStatus:s=>{statuses.push(s);}});
  const evidence=result.report?.sections.flatMap(s=>s.evidence)??[];
  const mappings=evidence.map(ref=>{
    const underlying=executor.outcomes.find(o=>o.record.id===ref.runId);
    return {ref,capabilityRecord:underlying?.record,valid:!!underlying&&underlying.record.status==='success'&&underlying.record.capabilityId===ref.capabilityId&&underlying.result?.provenance.fetchedAt===ref.fetchedAt};
  });
  const numericDataValid=executor.outcomes.every(o=>o.record.status==='success'&&strictPayload(o.record.capabilityId,o.result?.data));
  const check={caseId:c.id,status:result.summary.status,capabilities:result.summary.plannedCapabilities.length,evidenceCount:evidence.length,
    everyReferenceResolves:mappings.every(m=>m.valid)&&evidence.length===result.summary.plannedCapabilities.length,numericDataValid};
  checks.push(check);
  writeFileSync(join(out,`${c.id}.json`),JSON.stringify({recordedAt:new Date().toISOString(),scope:'extra live retrieval and local rule-based synthesis; excluded from performance samples; no real-model evaluation',...c,statuses,outcomes:executor.outcomes,synthesisInput,result,mappings,check},null,2));
  console.log(JSON.stringify(check));await Bun.sleep(2000);
}
writeFileSync(join(out,'checks.json'),JSON.stringify(checks,null,2));
if(checks.some(c=>c.status!=='completed'||!c.everyReferenceResolves||!c.numericDataValid))process.exitCode=1;
