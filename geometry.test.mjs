import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readSculptor} from './model.js';
import {solve,thickShell,meshQuality,binarySTL,facePatch,calibratePair,landmarks,fitImage,fitMesh} from './geometry.js';

test('numeric solver handles a pivot and returns a valid solution',()=>{
  const A=[[0,2,1],[2,1,0],[1,0,3]],b=[5,4,10],x=solve(A,b);
  A.forEach((row,i)=>assert.ok(Math.abs(row.reduce((sum,v,j)=>sum+v*x[j],0)-b[i])<1e-8));
});
test('thickened plane exports a closed solid with the requested wall and dimensions',()=>{
  const shell=thickShell(new Float32Array([-1,-1,0,1,-1,0,1,1,0,-1,1,0]),new Uint32Array([0,1,2,0,2,3]),.25);
  const report=meshQuality(shell.vertices,shell.faces);assert.equal(report.watertight,true);assert.equal(report.nonmanifoldEdges,0);
  assert.deepEqual(report.sizeMm,[2,2,.25]);assert.ok(Math.abs(report.volumeMm3-1)<1e-6);
  const stl=binarySTL(shell.vertices,shell.faces),view=new DataView(stl);assert.equal(view.getUint32(80,true),12);assert.equal(stl.byteLength,684);
  for(let i=84;i<stl.byteLength;i+=50)for(let j=0;j<12;j++)assert.ok(Number.isFinite(view.getFloat32(i+j*4,true)));
});
test('numeric model reader rejects non-model input without executing anything',()=>{
  assert.throws(()=>readSculptor(new TextEncoder().encode('not an NPY file').buffer));
});

const modelPath=process.env.SCULPTOR_MODEL_PATH;
test('released model: face-only region, paired scaling, closed STL, photo roundtrip',{skip:!modelPath},()=>{
  const bytes=fs.readFileSync(modelPath),model=readSculptor(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const ref=JSON.parse(fs.readFileSync(new URL('./reference.json',import.meta.url)));
  const patch=facePatch(model,model.skin,ref,{}),pair=calibratePair(model.skin,model.skull,patch,{width:150,height:190});
  assert.ok(patch.vertices.length<model.skin.length*.7,'ears, rear head and neck must be excluded');
  const shell=thickShell(pair.patch,patch.faces,4),quality=meshQuality(shell.vertices,shell.faces);
  assert.equal(quality.watertight,true);assert.ok(Math.abs(quality.sizeMm[0]-150)<.001);assert.ok(Math.abs(quality.sizeMm[1]-190)<.001);
  assert.equal(meshQuality(pair.skull,model.skullFaces).watertight,true);
  const lm=landmarks(model.skin,ref),observed=lm.map(p=>[p[0]*2.5+400,-p[1]*2.5+650]);
  const fitted=fitImage(model,ref,observed);assert.ok(fitted.rmse<.05,'an exact neutral projection must fit without artificial deformation');
  const input=new Float32Array(patch.vertices);for(let i=0;i<input.length;i+=3){input[i]=input[i]*1.2+12;input[i+1]=input[i+1]*1.2-15;input[i+2]=input[i+2]*1.2+20;}
  const fromMesh=fitMesh(model,input,ref);assert.ok(Number.isFinite(fromMesh.rmse));assert.ok(fromMesh.rmse<fromMesh.initialRmse+1,'normalized face mesh must fit with bounded residual');
});
