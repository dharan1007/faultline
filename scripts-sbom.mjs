import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';

const lockUrl=new URL('./package-lock.json',import.meta.url);
const lockBytes=await readFile(lockUrl);
const lock=JSON.parse(lockBytes.toString('utf8'));
const root=lock.packages?.[''];
if(!root?.name||!root?.version)throw new Error('PACKAGE_LOCK_ROOT_MISSING');
const lockHash=createHash('sha256').update(lockBytes).digest('hex');
const packageEntries=Object.entries(lock.packages||{}).filter(([path,pkg])=>path&&pkg?.version).sort(([a],[b])=>a.localeCompare(b));
const idFor=(name,index)=>`SPDXRef-Package-${String(index+1).padStart(3,'0')}-${String(name||'package').replace(/[^A-Za-z0-9.-]+/g,'-')}`;
const packages=[{
  SPDXID:'SPDXRef-Package-Root',name:root.name,versionInfo:root.version,downloadLocation:'NOASSERTION',filesAnalyzed:false,licenseConcluded:root.license||'NOASSERTION',licenseDeclared:root.license||'NOASSERTION',supplier:'NOASSERTION'
},...packageEntries.map(([path,pkg],index)=>{
  const name=path.replace(/^node_modules\//,'');
  return{SPDXID:idFor(name,index),name,versionInfo:pkg.version,downloadLocation:pkg.resolved||'NOASSERTION',filesAnalyzed:false,licenseConcluded:pkg.license||'NOASSERTION',licenseDeclared:pkg.license||'NOASSERTION',supplier:'NOASSERTION',externalRefs:[{referenceCategory:'PACKAGE-MANAGER',referenceType:'purl',referenceLocator:`pkg:npm/${encodeURIComponent(name)}@${pkg.version}`},...(pkg.integrity?[{referenceCategory:'OTHER',referenceType:'npm-integrity',referenceLocator:pkg.integrity}]:[])]};
})];
const byName=new Map(packages.slice(1).map(pkg=>[pkg.name,pkg.SPDXID]));
const relationships=[{spdxElementId:'SPDXRef-DOCUMENT',relationshipType:'DESCRIBES',relatedSpdxElement:'SPDXRef-Package-Root'}];
for(const name of Object.keys(root.dependencies||{}).sort())if(byName.has(name))relationships.push({spdxElementId:'SPDXRef-Package-Root',relationshipType:'DEPENDS_ON',relatedSpdxElement:byName.get(name)});
const now=new Date().toISOString();
const document={spdxVersion:'SPDX-2.3',dataLicense:'CC0-1.0',SPDXID:'SPDXRef-DOCUMENT',name:`${root.name}-${root.version}`,documentNamespace:`https://github.com/dharan1007/faultline/sbom/${root.version}/${lockHash}`,creationInfo:{created:now,creators:['Tool: faultline-lockfile-sbom/1.0']},documentDescribes:['SPDXRef-Package-Root'],packages,relationships,annotations:[{annotationType:'OTHER',annotator:'Tool: faultline-lockfile-sbom/1.0',annotationDate:now,comment:`package-lock.json sha256=${lockHash}; npm SRI values are preserved as package-manager external references.`}]};
await mkdir(new URL('./artifacts/',import.meta.url),{recursive:true});
await writeFile(new URL('./artifacts/faultline.spdx.json',import.meta.url),`${JSON.stringify(document,null,2)}\n`);
console.log(`SBOM generated for ${packages.length} packages; lock sha256=${lockHash}`);
