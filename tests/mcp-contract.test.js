import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createFaultlineMcpHandler } from '../server/mcp-server.js';

function createClient(handler){
  const transport=new StreamableHTTPClientTransport(new URL('http://faultline.test/mcp'),{
    fetch:(url,init)=>handler.fetch(new Request(url,init))
  });
  const client=new Client({name:'faultline-contract-test',version:'1.0.0'},{versionNegotiation:{mode:'auto'}});
  return {client,transport};
}

test('remote MCP negotiates the modern protocol and exposes project-oriented tools',async()=>{
  const handler=createFaultlineMcpHandler();
  const {client,transport}=createClient(handler);
  try{
    await client.connect(transport);
    assert.equal(client.getProtocolEra(),'modern');
    const result=await client.listTools();
    const names=result.tools.map(tool=>tool.name).sort();
    assert.deepEqual(names,[
      'faultline_evidence_get',
      'faultline_failure_evaluate',
      'faultline_investigation_create',
      'faultline_project_inspect',
      'faultline_project_verify',
      'faultline_reduce',
      'faultline_reproducer_export',
      'faultline_run_start',
      'faultline_run_status'
    ].sort());
  }finally{
    await client.close().catch(()=>{});
    await handler.close?.().catch(()=>{});
  }
});

test('faultline_project_inspect calls the same deterministic detector as REST',async()=>{
  const handler=createFaultlineMcpHandler();
  const {client,transport}=createClient(handler);
  try{
    await client.connect(transport);
    const result=await client.callTool({name:'faultline_project_inspect',arguments:{
      packageJson:{dependencies:{next:'16.0.0',react:'19.0.0'},scripts:{dev:'next dev',build:'next build'}},
      files:['package.json','package-lock.json','next.config.mjs']
    }});
    assert.equal(result.isError,undefined);
    assert.equal(result.structuredContent.framework,'next');
    assert.equal(result.structuredContent.packageManager,'npm');
    assert.equal(result.structuredContent.compatibility,'ready');
  }finally{
    await client.close().catch(()=>{});
    await handler.close?.().catch(()=>{});
  }
});

test('remote-execution tools fail closed until a verified sandbox adapter is injected',async()=>{
  const handler=createFaultlineMcpHandler();
  const {client,transport}=createClient(handler);
  try{
    await client.connect(transport);
    const result=await client.callTool({name:'faultline_project_verify',arguments:{source:{kind:'git',url:'https://github.com/vercel/examples.git'}}});
    assert.equal(result.isError,true);
    assert.equal(result.structuredContent.ok,false);
    assert.equal(result.structuredContent.error.code,'CONFIGURATION_REQUIRED');
    assert.match(result.content[0].text,/sandbox/i);
  }finally{
    await client.close().catch(()=>{});
    await handler.close?.().catch(()=>{});
  }
});
