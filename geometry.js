export const FIT_IDS=[10,152,33,133,362,263,168,6,197,1,4,98,327,234,454,172,397,136,365,150,379,93,323];
export const OVAL=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
export function landmarks(vertices,ref){const out=[];for(let i=0;i<ref.vertexIds.length;i++){const p=[0,0,0];for(let j=0;j<3;j++)for(let d=0;d<3;d++)p[d]+=vertices[ref.vertexIds[i][j]*3+d]*ref.weights[i][j];out.push(p);}return out;}
export function solve(a,b){
  const n=b.length,m=a.map((row,i)=>[...row,b[i]]);
  for(let i=0;i<n;i++){
    let pivot=i;for(let j=i+1;j<n;j++)if(Math.abs(m[j][i])>Math.abs(m[pivot][i]))pivot=j;
    if(Math.abs(m[pivot][i])<1e-12){m[i][i]+=1e-8;pivot=i;}
    [m[i],m[pivot]]=[m[pivot],m[i]];
    const v=m[i][i];for(let j=i;j<=n;j++)m[i][j]/=v;
    for(let k=0;k<n;k++)if(k!==i){const f=m[k][i];if(f)for(let j=i;j<=n;j++)m[k][j]-=f*m[i][j];}
  }return m.map(row=>row[n]);
}
function rotate(p,r){const [sx,cx]=[Math.sin(r[0]),Math.cos(r[0])],[sy,cy]=[Math.sin(r[1]),Math.cos(r[1])],[sz,cz]=[Math.sin(r[2]),Math.cos(r[2])];let [x,y,z]=p;[y,z]=[cx*y-sx*z,sx*y+cx*z];[x,z]=[cy*x+sy*z,-sy*x+cy*z];return [cz*x-sz*y,sz*x+cz*y,z];}
export function fitImage(model,ref,observed,progress=()=>{}){
  const neutral=landmarks(model.skin,ref),base=FIT_IDS.map(i=>neutral[i]);
  const center=[0,1,2].map(d=>base.reduce((s,p)=>s+p[d],0)/base.length);
  const basis=Array.from({length:model.n},(_,k)=>landmarks(model.skinBasis.subarray(k*model.skin.length,(k+1)*model.skin.length),ref));
  const eye=Math.hypot(...observed[33].map((v,d)=>v-observed[263][d]));
  const modelEye=Math.hypot(base[2][0]-base[5][0],base[2][1]-base[5][1]);
  if(eye<20)throw Error('人脸分辨率太低，请上传更清晰的正面照片');
  const means=[0,1].map(d=>FIT_IDS.reduce((s,i)=>s+observed[i][d],0)/base.length);
  let x=[0,0,0,Math.log(eye/modelEye),...means,...new Array(model.n).fill(0)];
  const noise=Math.max(2,eye*.025);
  function predict(params){return base.map((p,j)=>{const point=p.map((v,d)=>v-center[d]+basis.reduce((s,b,k)=>s+params[k+6]*b[FIT_IDS[j]][d],0));const q=rotate(point,params);return [Math.exp(params[3])*q[0]+params[4],-Math.exp(params[3])*q[1]+params[5]];});}
  function residual(params){const prediction=predict(params),r=[];for(let i=0;i<base.length;i++)for(let d=0;d<2;d++)r.push((prediction[i][d]-observed[FIT_IDS[i]][d])/noise);r.push(...params.slice(6));return r;}
  const loss=r=>r.reduce((s,v)=>s+v*v,0);let lambda=.02,last=Infinity;
  for(let iter=0;iter<65;iter++){
    const r=residual(x),cost=loss(r),n=x.length,jac=[];
    for(let k=0;k<n;k++){const step=k===4||k===5?.01:.0005;const trial=x.slice();trial[k]+=step;const rr=residual(trial);jac.push(rr.map((v,i)=>(v-r[i])/step));}
    const A=Array.from({length:n},()=>new Array(n).fill(0)),b=new Array(n).fill(0);
    for(let i=0;i<n;i++){for(let t=0;t<r.length;t++)b[i]-=jac[i][t]*r[t];for(let j=0;j<=i;j++){let value=0;for(let t=0;t<r.length;t++)value+=jac[i][t]*jac[j][t];A[i][j]=A[j][i]=value;}A[i][i]+=lambda*Math.max(1,A[i][i]);}
    const delta=solve(A,b),trial=x.map((v,i)=>{const z=v+delta[i];return i<3?Math.max(-.65,Math.min(.65,z)):i>=6?Math.max(-3,Math.min(3,z)):z;});
    if(loss(residual(trial))<cost){x=trial;lambda=Math.max(1e-7,lambda*.4);if(Math.abs(last-cost)<1e-7)break;last=cost;}else lambda=Math.min(1e8,lambda*4);
    if(iter%10===0)progress('拟合脸部特征',Math.round(30+iter/65*45));
  }
  const predicted=predict(x),rmse=Math.sqrt(predicted.reduce((s,p,j)=>s+(p[0]-observed[FIT_IDS[j]][0])**2+(p[1]-observed[FIT_IDS[j]][1])**2,0)/base.length);
  return {beta:new Float32Array(x.slice(6)),camera:x.slice(0,6),rmse,landmarkCount:base.length,method:'2D landmarks + regularized SCULPTOR shared shape prior',scaleMeasured:false};
}

export function bounds(vertices){const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];for(let i=0;i<vertices.length;i++) {const d=i%3;low[d]=Math.min(low[d],vertices[i]);high[d]=Math.max(high[d],vertices[i]);}return {low,high,size:high.map((v,d)=>v-low[d]),center:high.map((v,d)=>(v+low[d])/2)};}
export function vertexNormals(vertices,faces){const n=new Float32Array(vertices.length);for(let i=0;i<faces.length;i+=3){const a=faces[i]*3,b=faces[i+1]*3,c=faces[i+2]*3;const u=[0,1,2].map(d=>vertices[b+d]-vertices[a+d]),v=[0,1,2].map(d=>vertices[c+d]-vertices[a+d]);const q=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];for(const id of [a,b,c])for(let d=0;d<3;d++)n[id+d]+=q[d];}for(let i=0;i<n.length;i+=3){const len=Math.hypot(n[i],n[i+1],n[i+2])||1;for(let d=0;d<3;d++)n[i+d]/=len;}return n;}
export function edges(faces){const map=new Map();for(let i=0;i<faces.length;i+=3)for(let j=0;j<3;j++){const a=faces[i+j],b=faces[i+(j+1)%3],key=a<b?a+','+b:b+','+a;const e=map.get(key);if(e){e.count++;e.orientationBalance+=a<b?1:-1;}else map.set(key,{a,b,count:1,orientationBalance:a<b?1:-1});}return map;}
export function meshQuality(vertices,faces){const e=edges(faces);let boundary=0,nonmanifold=0,inconsistent=0;for(const value of e.values()){if(value.count===1)boundary++;if(value.count>2)nonmanifold++;if(value.count===2&&value.orientationBalance!==0)inconsistent++;}let volume=0;for(let i=0;i<faces.length;i+=3){const a=faces[i]*3,b=faces[i+1]*3,c=faces[i+2]*3;volume+=(vertices[a]*(vertices[b+1]*vertices[c+2]-vertices[b+2]*vertices[c+1])+vertices[a+1]*(vertices[b+2]*vertices[c]-vertices[b]*vertices[c+2])+vertices[a+2]*(vertices[b]*vertices[c+1]-vertices[b+1]*vertices[c]))/6;}return {vertices:vertices.length/3,triangles:faces.length/3,boundaryEdges:boundary,nonmanifoldEdges:nonmanifold,inconsistentEdges:inconsistent,windingConsistent:inconsistent===0,signedVolumeMm3:volume,positiveVolume:volume>0,watertight:boundary===0&&nonmanifold===0,volumeMm3:Math.abs(volume),sizeMm:bounds(vertices).size,selfIntersections:'not independently certified'};}
function insidePolygon(x,y,polygon){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
export function facePatch(model,skin,ref,settings){
  const neutral=landmarks(model.skin,ref),center=[(neutral[234][0]+neutral[454][0])/2,(neutral[10][1]+neutral[152][1])/2];
  const polygon=OVAL.map(id=>[center[0]+(neutral[id][0]-center[0])*1.05,center[1]+(neutral[id][1]-center[1])*1.04]);
  const back=Math.min(neutral[234][2],neutral[454][2],neutral[127][2],neutral[356][2])-8;
  const keep=new Uint8Array(skin.length/3);
  for(let i=0;i<keep.length;i++)keep[i]=insidePolygon(model.skin[i*3],model.skin[i*3+1],polygon)&&model.skin[i*3+2]>back?1:0;
  const front=[];for(let i=0;i<model.skinFaces.length;i+=3){const f=model.skinFaces.subarray(i,i+3);if(f.every(id=>keep[id]))front.push(...f);}
  const used=[...new Set(front)],mapping=new Map(used.map((id,i)=>[id,i]));
  const vertices=new Float32Array(used.length*3);used.forEach((id,i)=>vertices.set(skin.subarray(id*3,id*3+3),i*3));
  const faces=new Uint32Array(front.map(id=>mapping.get(id)));
  if(faces.length<300)throw Error('面皮裁剪区域过小，无法导出');
  // Relax the discrete triangle-selection rim, including opening rims, while
  // keeping the identity-bearing interior unchanged. Bound movement to 2 mm
  // in source model units before the requested dimensional calibration.
  const neighbours=new Map();for(const {a,b,count} of edges(faces).values())if(count===1){if(!neighbours.has(a))neighbours.set(a,[]);if(!neighbours.has(b))neighbours.set(b,[]);neighbours.get(a).push(b);neighbours.get(b).push(a);}
  const original=new Float32Array(vertices);
  for(let pass=0;pass<12;pass++){const previous=new Float32Array(vertices);for(const [id,near] of neighbours){if(near.length!==2)continue;const delta=[0,1,2].map(d=>.5*previous[id*3+d]+.25*(previous[near[0]*3+d]+previous[near[1]*3+d])-original[id*3+d]),factor=Math.min(1,2/(Math.hypot(...delta)||1));for(let d=0;d<3;d++)vertices[id*3+d]=original[id*3+d]+delta[d]*factor;}}
  return {vertices,faces,region:'front face only; ears, posterior scalp, neck and shoulders excluded',skinLandmarks:landmarks(skin,ref)};
}
export function thickShell(vertices,faces,thickness){
  const normals=vertexNormals(vertices,faces),n=vertices.length/3,out=new Float32Array(vertices.length*2);out.set(vertices);
  for(let i=0;i<vertices.length;i++)out[vertices.length+i]=vertices[i]-thickness*normals[i];
  const indices=Array.from(faces);for(let i=0;i<faces.length;i+=3)indices.push(faces[i]+n,faces[i+2]+n,faces[i+1]+n);
  for(const {a,b,count} of edges(faces).values())if(count===1)indices.push(b,a,a+n,b,a+n,b+n);
  return {vertices:out,faces:new Uint32Array(indices)};
}
export function calibratePair(skin,skull,patch,settings){
  const box=bounds(patch.vertices),sx=settings.width/box.size[0],sy=settings.height/box.size[1],sz=Math.sqrt(sx*sy);
  const transform=v=>{const result=new Float32Array(v.length);for(let i=0;i<v.length;i+=3){result[i]=(v[i]-box.center[0])*sx;result[i+1]=(v[i+1]-box.center[1])*sy;result[i+2]=(v[i+2]-box.center[2])*sz;}return result;};
  return {skin:transform(skin),skull:transform(skull),patch:transform(patch.vertices),scale:[sx,sy,sz],calibration:'bounding dimensions only; mechanical mating not certified'};
}
export function binarySTL(vertices,faces){
  const out=new ArrayBuffer(84+faces.length/3*50),view=new DataView(out),label=new TextEncoder().encode('FaceForm | statistical estimate | millimetres');new Uint8Array(out,0,label.length).set(label);view.setUint32(80,faces.length/3,true);
  let offset=84;for(let i=0;i<faces.length;i+=3){const p=Array.from(faces.subarray(i,i+3),id=>Array.from(vertices.subarray(id*3,id*3+3))),u=p[1].map((v,d)=>v-p[0][d]),v=p[2].map((x,d)=>x-p[0][d]);let norm=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=Math.hypot(...norm)||1;norm=norm.map(x=>x/len);for(const x of [...norm,...p.flat()]){view.setFloat32(offset,x,true);offset+=4;}offset+=2;}return out;
}

class KDTree{
  constructor(points){this.points=points;const build=(ids,depth)=>{if(!ids.length)return null;const axis=depth%3;ids.sort((a,b)=>points[a][axis]-points[b][axis]);const mid=ids.length>>1;return {id:ids[mid],axis,left:build(ids.slice(0,mid),depth+1),right:build(ids.slice(mid+1),depth+1)};};this.root=build(points.map((_,i)=>i),0);}
  query(q){let best=-1,distance=Infinity;const visit=node=>{if(!node)return;const p=this.points[node.id],d=(q[0]-p[0])**2+(q[1]-p[1])**2+(q[2]-p[2])**2;if(d<distance){distance=d;best=node.id;}const delta=q[node.axis]-p[node.axis];visit(delta<0?node.left:node.right);if(delta*delta<distance)visit(delta<0?node.right:node.left);};visit(this.root);return [this.points[best],distance];}
}
export function fitMesh(model,vertices,ref,progress=()=>{}){
  if(vertices.length<90||vertices.some(v=>!Number.isFinite(v)))throw Error('模型包含无效顶点');
  const neutralPatch=facePatch(model,model.skin,ref,{}),source=[];
  for(let i=0;i<neutralPatch.vertices.length;i+=Math.max(3,Math.ceil(neutralPatch.vertices.length/3600/3)*3))source.push(Array.from(neutralPatch.vertices.subarray(i,i+3)));
  const target=[];for(let i=0;i<vertices.length;i+=Math.max(3,Math.ceil(vertices.length/15000/3)*3))target.push(Array.from(vertices.subarray(i,i+3)));
  const tb=bounds(vertices),sb=bounds(neutralPatch.vertices),scale=sb.size[1]/tb.size[1];
  if(!Number.isFinite(scale)||tb.size.some(v=>v<1e-6))throw Error('输入模型缺少有效的三维尺寸');
  const normalized=target.map(p=>p.map((v,d)=>(v-tb.center[d])*scale+sb.center[d])),tree=new KDTree(normalized);
  const sourceTree=new KDTree(Array.from({length:model.skin.length/3},(_,i)=>Array.from(model.skin.subarray(i*3,i*3+3))));
  // Source locations map back to the released topology; input topology need not match.
  const sourceIds=source.map(p=>{const q=sourceTree.query(p)[0];let id=0,best=Infinity;for(let i=0;i<model.skin.length;i+=3){const d=(q[0]-model.skin[i])**2+(q[1]-model.skin[i+1])**2+(q[2]-model.skin[i+2])**2;if(d<best){best=d;id=i/3;}}return id;});
  let beta=new Array(model.n).fill(0),translation=[0,0,0],rmse=Infinity,initialRmse=null;
  for(let iter=0;iter<16;iter++){
    const rows=[],rhs=[],distances=[];
    for(const id of sourceIds){const point=Array.from(model.skin.subarray(id*3,id*3+3));for(let k=0;k<model.n;k++)for(let d=0;d<3;d++)point[d]+=beta[k]*model.skinBasis[k*model.skin.length+id*3+d];for(let d=0;d<3;d++)point[d]+=translation[d];const [matched,distance]=tree.query(point);distances.push(distance);rows.push({id,matched,distance});}
    const cutoff=[...distances].sort((a,b)=>a-b)[Math.floor(distances.length*.85)],active=rows.filter(r=>r.distance<=cutoff);
    if(initialRmse===null)initialRmse=Math.sqrt(active.reduce((s,r)=>s+r.distance,0)/active.length);
    translation=[0,1,2].map(d=>active.reduce((s,r)=>{let q=model.skin[r.id*3+d];for(let k=0;k<model.n;k++)q+=beta[k]*model.skinBasis[k*model.skin.length+r.id*3+d];return s+r.matched[d]-q;},0)/active.length);
    const A=Array.from({length:model.n},()=>new Array(model.n).fill(0)),b=new Array(model.n).fill(0);
    for(const row of active)for(let d=0;d<3;d++){const design=Array.from({length:model.n},(_,k)=>model.skinBasis[k*model.skin.length+row.id*3+d]),value=row.matched[d]-translation[d]-model.skin[row.id*3+d];for(let i=0;i<model.n;i++){b[i]+=design[i]*value;for(let j=0;j<=i;j++)A[i][j]+=design[i]*design[j];}}
    for(let i=0;i<model.n;i++){for(let j=0;j<i;j++)A[j][i]=A[i][j];A[i][i]+=20;}
    beta=solve(A,b).map(v=>Math.max(-3,Math.min(3,v)));rmse=Math.sqrt(active.reduce((s,r)=>s+r.distance,0)/active.length);
    progress('拟合 3D 面部表面',30+Math.round(iter/16*45));
  }
  return {beta:new Float32Array(beta),rmse,initialRmse,method:'initialized point-cloud ICP + regularized SCULPTOR shared shape prior',scaleMeasured:false,alignment:'assumes front-facing mesh, Y up; normalized to model before fitting',sourceInputSize:tb.size};
}
