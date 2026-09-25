import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  createSourceMapEvidence,
  verifySourceMapEvidence,
  SOURCE_MAP_EVIDENCE_SCHEMA
} from '../integrations/source-map-evidence/index.js';

test('source-map evidence binds generated asset and map without copying source contents',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'faultline-sourcemap-'));
  try{
    const generated=join(dir,'app.js');
    const map=join(dir,'app.js.map');
    await writeFile(generated,'console.log("compiled");\n');
    await writeFile(map,JSON.stringify({
      version:3,
      sourceRoot:'webpack:///',
      sources:['src/app.ts','https://user:pass@example.test/src/secret.ts?token=x#frag'],
      names:['console','log'],
      mappings:'AAAA',
      sourcesContent:['console.log("source");','secret']
    }));
    const evidence=await createSourceMapEvidence({
      generatedPath:generated,
      mapPath:map,
      sourceRepository:'https://github.com/acme/app',
      sourceCommit:'a'.repeat(40)
    });
    assert.equal(evidence.schema,SOURCE_MAP_EVIDENCE_SCHEMA);
    assert.equal(evidence.mapping.sourceCount,2);
    assert.equal(evidence.mapping.sourcesContentIncluded,false);
    assert.equal(evidence.mapping.hasSourcesContent,true);
    assert.equal(evidence.mapping.sources[1],'https://example.test/src/secret.ts');
    assert.equal((await verifySourceMapEvidence(evidence)).ok,true);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('source-map evidence detects generated or map drift',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'faultline-sourcemap-drift-'));
  try{
    const generated=join(dir,'app.js');
    const map=join(dir,'app.js.map');
    await writeFile(generated,'one');
    await writeFile(map,JSON.stringify({version:3,sources:['src/a.ts'],names:[],mappings:'AAAA'}));
    const evidence=await createSourceMapEvidence({generatedPath:generated,mapPath:map});
    await writeFile(generated,'two');
    assert.equal((await verifySourceMapEvidence(evidence)).ok,false);
  }finally{await rm(dir,{recursive:true,force:true});}
});
