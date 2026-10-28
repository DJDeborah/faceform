import test from 'node:test';
import assert from 'node:assert/strict';
import {castingMolds,heightSolid} from './molds.js';
import {meshQuality} from './geometry.js';

test('height solid has positive volume and a closed triangulated working surface',()=>{
  const m=heightSolid(3,3,-1,-1,1,new Float64Array(9).fill(2),0),q=meshQuality(m.vertices,m.faces);
  assert.equal(q.watertight,true);assert.ok(Math.abs(q.volumeMm3-8)<1e-6);assert.deepEqual(q.sizeMm,[2,2,2]);
});
test('paired tooling retains a planar 2 mm casting gap, bounded smoothing and flat print backs',()=>{
  const vertices=new Float32Array([-15,-20,5,15,-20,5,15,20,5,-15,20,5]);
  const molds=castingMolds(vertices,new Uint32Array([0,1,2,0,2,3]),{thickness:2,moldResolution:.5});
  assert.equal(molds.report.male.watertight,true);assert.equal(molds.report.female.watertight,true);
  assert.ok(molds.report.surfaceFilterMaxDeviationMm<1e-9);assert.ok(Math.abs(molds.report.axialCastingGapMm[1]-2)<1e-6);
  for(const part of [molds.male,molds.female]){let min=Infinity;for(let i=2;i<part.vertices.length;i+=3)min=Math.min(min,part.vertices[i]);assert.equal(min,0);}
  // Restore assembly coordinates and check the center of the cavity.
  function zAt(part,x,y){for(let i=0;i<part.vertices.length;i+=3)if(Math.abs(part.vertices[i]-x)<1e-6&&Math.abs(part.vertices[i+1]-y)<1e-6)return part.vertices[i+2];throw Error('missing sample');}
  const male=zAt(molds.male,0,0)-8,female=molds.report.assemblyFromPrint.female.translation[2]-zAt(molds.female,0,0);
  assert.ok(Math.abs(female-male-2)<1e-6);
  // Same projected triangles are necessary: two diagonals on a nonplanar
  // shutoff cell can intersect even when all four corner gaps are zero.
  const [nx,ny]=molds.report.gridDimensions,nfaces=(nx-1)*(ny-1)*2;
  const xyKey=(part,face,female)=>Array.from(part.faces.subarray(face*3,face*3+3),id=>[part.vertices[id*3].toFixed(4),(part.vertices[id*3+1]*(female?-1:1)).toFixed(4)].join(',')).sort().join(';');
  const femaleTriangles=new Set(Array.from({length:nfaces},(_,i)=>xyKey(molds.female,i,true)));
  for(let i=0;i<nfaces;i++)assert.ok(femaleTriangles.has(xyKey(molds.male,i,false)),'restored mold surfaces must use matching projected diagonals');
});
