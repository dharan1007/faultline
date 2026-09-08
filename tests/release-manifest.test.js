import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

import {buildReleaseManifest,RELEASE_MANIFEST} from '../scripts-release-manifest.mjs';

test('release manifest deterministically covers every shipped public file including hashed assets',()=>{
  const root=mkdtempSync(path.join(tmpdir(),'faultline-release-'));
  try{
    mkdirSync(path.join(root,'src'),{recursive:true});
    mkdirSync(path.join(root,'demo','assets'),{recursive:true});
    writeFileSync(path.join(root,'index.html'),'home');
    writeFileSync(path.join(root,'src','runtime.js'),'runtime');
    writeFileSync(path.join(root,'demo','index.html'),'demo');
    writeFileSync(path.join(root,'demo','assets','index-ABC123.js'),'js');
    writeFileSync(path.join(root,'demo','assets','index-XYZ987.css'),'css');

    const files=buildReleaseManifest(root);
    assert.deepEqual(files,[
      RELEASE_MANIFEST,
      'demo/assets/index-ABC123.js',
      'demo/assets/index-XYZ987.css',
      'demo/index.html',
      'index.html',
      'src/runtime.js'
    ]);
    assert.equal(readFileSync(path.join(root,RELEASE_MANIFEST),'utf8'),`${files.join('\n')}\n`);
  }finally{
    rmSync(root,{recursive:true,force:true});
  }
});
