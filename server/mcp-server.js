import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { createDefaultServices } from './services.js';

function toolResult(value){
  const isError=Boolean(value&&value.ok===false&&value.error);
  const text=isError?String(value.error.message||value.error.code||'FAULTLINE operation failed'):JSON.stringify(value);
  return {
    content:[{type:'text',text}],
    structuredContent:value&&typeof value==='object'?value:{value},
    ...(isError?{isError:true}:{})
  };
}

const jsonObject=z.record(z.string(),z.unknown());
const sourceSchema=z.object({
  kind:z.enum(['git','url','minimal']),
  url:z.string().url().optional(),
  branch:z.string().max(256).optional(),
  revision:z.string().max(256).optional()
});
const oracleSchema=z.object({
  kind:z.enum(['dom_property','computed_style','dom_exists','runtime_error','text','url']),
  equals:z.unknown().optional(),
  selector:z.string().max(4096).optional(),
  property:z.string().max(512).optional()
});

export function createFaultlineMcpServer({services=createDefaultServices()}={}){
  const server=new McpServer({name:'faultline',version:'0.9.0'},{capabilities:{tools:{}}});

  server.registerTool('faultline_project_inspect',{
    title:'FAULTLINE · Inspect project manifest',
    description:'Deterministically detect framework, package manager, workspace and candidate lifecycle commands from project manifest metadata. Does not execute repository code.',
    inputSchema:z.object({packageJson:jsonObject.nullable().optional(),files:z.array(z.string().max(1024)).max(2000).default([])}),
    annotations:{readOnlyHint:true}
  },async input=>toolResult(services.inspectProjectManifest(input)));

  server.registerTool('faultline_project_verify',{
    title:'FAULTLINE · Verify connected project',
    description:'Provision the configured isolated execution adapter and prove that a connected project can be prepared and launched. Fails closed when isolated execution is unavailable.',
    inputSchema:z.object({source:sourceSchema,projectId:z.string().max(256).optional()}),
    annotations:{readOnlyHint:false}
  },async input=>toolResult(await services.projectVerify(input)));

  server.registerTool('faultline_investigation_create',{
    title:'FAULTLINE · Create investigation',
    description:'Create a canonical investigation definition tied to a project. This creates metadata only; it does not claim the failure has been reproduced.',
    inputSchema:z.object({projectId:z.string().min(1).max(256),id:z.string().max(256).optional(),title:z.string().max(512).optional(),report:z.object({description:z.string().max(12000).optional(),route:z.string().max(4096).optional(),expected:z.string().max(12000).optional(),observed:z.string().max(12000).optional()}).optional(),sourceRevision:z.string().max(256).optional()}),
    annotations:{readOnlyHint:false}
  },async input=>toolResult(services.createInvestigationRecord(input)));

  server.registerTool('faultline_run_start',{
    title:'FAULTLINE · Start investigation run',
    description:'Start a bounded remote investigation run through the verified isolated execution adapter.',
    inputSchema:z.object({projectId:z.string().max(256),investigationId:z.string().max(256),source:sourceSchema.optional(),scenario:jsonObject.optional()}),
    annotations:{readOnlyHint:false}
  },async input=>toolResult(await services.runStart(input)));

  server.registerTool('faultline_run_status',{
    title:'FAULTLINE · Read run status',
    description:'Read the canonical state and normalized events for a previously started FAULTLINE run.',
    inputSchema:z.object({runId:z.string().min(1).max(512)}),
    annotations:{readOnlyHint:true}
  },async input=>toolResult(await services.runStatus(input)));

  server.registerTool('faultline_failure_evaluate',{
    title:'FAULTLINE · Evaluate normalized observation',
    description:'Compare a normalized browser observation with a deterministic failure oracle. This tool does not execute user source code.',
    inputSchema:z.object({oracle:oracleSchema,observation:z.object({actual:z.unknown().optional()})}),
    annotations:{readOnlyHint:true}
  },async input=>toolResult(services.evaluateFailure(input)));

  server.registerTool('faultline_reduce',{
    title:'FAULTLINE · Reduce failing case',
    description:'Run bounded causal reduction while requiring the locked failure oracle to remain failing. Requires a verified execution adapter for remote projects.',
    inputSchema:z.object({runId:z.string().max(512).optional(),targetAxis:z.enum(['html','css','js']).optional(),maxTrials:z.number().int().min(1).max(200).optional()}),
    annotations:{readOnlyHint:false}
  },async input=>toolResult(await services.reduce(input)));

  server.registerTool('faultline_evidence_get',{
    title:'FAULTLINE · Get causal evidence',
    description:'Read normalized observations, interventions and verification evidence for a run or investigation.',
    inputSchema:z.object({runId:z.string().max(512).optional(),investigationId:z.string().max(512).optional(),limit:z.number().int().min(1).max(200).optional()}),
    annotations:{readOnlyHint:true}
  },async input=>toolResult(await services.evidenceGet(input)));

  server.registerTool('faultline_reproducer_export',{
    title:'FAULTLINE · Export minimal reproducer',
    description:'Export an already-defined minimal HTML/CSS/JavaScript case as a standalone reproducer. No remote execution occurs.',
    inputSchema:z.object({case:z.object({html:z.string().max(1000000),css:z.string().max(1000000),js:z.string().max(1000000)})}),
    annotations:{readOnlyHint:true}
  },async input=>toolResult(services.exportReproducer(input)));

  return server;
}

export function createFaultlineMcpHandler(options={}){
  return createMcpHandler(()=>createFaultlineMcpServer(options));
}
