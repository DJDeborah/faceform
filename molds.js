import {bounds,meshQuality} from './geometry.js';

// Front-opening two-part tooling. Surfaces are sampled in millimetres, never
// inferred from an STL unit flag (STL does not carry units).
function raster(vertices,faces,nx,ny,x0,y0,step){
  const hi=new Float64Array(nx*ny).fill(-Infinity),lo=new Float64Array(nx*ny).fill(Infinity);
  for(let k=0;k<faces.length;k+=3){
    const ids=[faces[k]*3,faces[k+1]*3,faces[k+2]*3],p=ids.map(i=>[(vertices[i]-x0)/step,(vertices[i+1]-y0)/step,vertices[i+2]]);
    const [a,b,c]=p,den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-10)continue;
    const xmin=Math.max(0,Math.ceil(Math.min(...p.map(q=>q[0]))-1e-7)),xmax=Math.min(nx-1,Math.floor(Math.max(...p.map(q=>q[0]))+1e-7));
    const ymin=Math.max(0,Math.ceil(Math.min(...p.map(q=>q[1]))-1e-7)),ymax=Math.min(ny-1,Math.floor(Math.max(...p.map(q=>q[1]))+1e-7));
    for(let y=ymin;y<=ymax;y++)for(let x=xmin;x<=xmax;x++){
      const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den,w=1-u-v;
      if(Math.min(u,v,w)<-1e-7)continue;const z=u*a[2]+v*b[2]+w*c[2],i=y*nx+x;hi[i]=Math.max(hi[i],z);lo[i]=Math.min(lo[i],z);
    }
  }return {hi,lo};
}
function floodBackground(mask,nx,ny){
  const outside=new Uint8Array(mask.length),queue=new Int32Array(mask.length);let start=0,end=0;
  const add=i=>{if(!mask[i]&&!outside[i]){outside[i]=1;queue[end++]=i;}};
  for(let x=0;x<nx;x++){add(x);add((ny-1)*nx+x);}for(let y=0;y<ny;y++){add(y*nx);add(y*nx+nx-1);}
  while(start<end){const i=queue[start++],x=i%nx;if(x)add(i-1);if(x<nx-1)add(i+1);if(i>=nx)add(i-nx);if(i<mask.length-nx)add(i+nx);}return outside;
}
// Exact squared Euclidean distance transform (separable lower envelopes).
function edt(mask,nx,ny,target){
  const temp=new Float64Array(mask.length),out=new Float64Array(mask.length),max=Math.max(nx,ny),f=new Float64Array(max),d=new Float64Array(max),v=new Int32Array(max),z=new Float64Array(max+1);
  function line(n){let k=0;v[0]=0;z[0]=-Infinity;z[1]=Infinity;
    for(let q=1;q<n;q++){let s;do{s=((f[q]+q*q)-(f[v[k]]+v[k]*v[k]))/(2*q-2*v[k]);if(s<=z[k])k--;else break;}while(k>=0);k++;v[k]=q;z[k]=s;z[k+1]=Infinity;}
    k=0;for(let q=0;q<n;q++){while(z[k+1]<q)k++;d[q]=(q-v[k])**2+f[v[k]];}
  }
  for(let y=0;y<ny;y++){for(let x=0;x<nx;x++)f[x]=Boolean(mask[y*nx+x])===target?0:1e12;line(nx);for(let x=0;x<nx;x++)temp[y*nx+x]=d[x];}
  for(let x=0;x<nx;x++){for(let y=0;y<ny;y++)f[y]=temp[y*nx+x];line(ny);for(let y=0;y<ny;y++)out[y*nx+x]=Math.sqrt(d[y]);}return out;
}
function harmonic(field,unknown,nx,ny,iterations=1200){
  // Red-black SOR; fixed measured face samples and the outer flat flange are
  // Dirichlet data. This avoids the radial seams of nearest-edge extrusion.
  for(let pass=0;pass<iterations;pass++){let delta=0;
    for(let parity=0;parity<2;parity++)for(let y=1;y<ny-1;y++)for(let x=1+(y+parity)%2;x<nx-1;x+=2){const i=y*nx+x;if(!unknown[i])continue;const mean=(field[i-1]+field[i+1]+field[i-nx]+field[i+nx])/4,change=1.65*(mean-field[i]);field[i]+=change;delta=Math.max(delta,Math.abs(change));}
    if(delta<.0005)break;
  }
}
function smoothMeasured(field,mask,nx,ny,step){
  const radius=Math.max(1,Math.ceil(.7/step)),sigma=.4/step,temp=new Float64Array(field),result=new Float64Array(field);
  for(const [source,dest,horizontal] of [[field,temp,true],[temp,result,false]])for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
    const i=y*nx+x;if(!mask[i])continue;let sum=0,weight=0;
    for(let d=-radius;d<=radius;d++){const xx=x+(horizontal?d:0),yy=y+(horizontal?0:d);if(xx<0||xx>=nx||yy<0||yy>=ny)continue;const j=yy*nx+xx;if(!mask[j])continue;const w=Math.exp(-.5*d*d/(sigma*sigma));sum+=source[j]*w;weight+=w;}
    // The input is already smooth anatomy. Bound filtering to avoid erasing
    // eyelids or changing the fitted facial geometry by millimetres.
    dest[i]=source[i]+Math.max(-.15,Math.min(.15,sum/weight-source[i]));
  }return result;
}
export function heightSolid(nx,ny,x0,y0,step,top,bottom,reverseDiagonal=false){
  const count=nx*ny,ring=[];for(let x=0;x<nx;x++)ring.push(x);for(let y=1;y<ny;y++)ring.push(y*nx+nx-1);for(let x=nx-2;x>=0;x--)ring.push((ny-1)*nx+x);for(let y=ny-2;y>0;y--)ring.push(y*nx);
  const vertices=new Float32Array((count+ring.length+1)*3),faces=new Uint32Array(((nx-1)*(ny-1)*2+ring.length*3)*3);let p=0;
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const i=y*nx+x;vertices.set([x0+x*step,y0+y*step,top[i]],i*3);}
  for(let y=0;y<ny-1;y++)for(let x=0;x<nx-1;x++){const a=y*nx+x,b=a+1,c=b+nx,d=a+nx;faces.set(reverseDiagonal?[a,b,d,b,c,d]:[a,b,c,a,c,d],p);p+=6;}
  const center=count+ring.length;vertices.set([x0+(nx-1)*step/2,y0+(ny-1)*step/2,bottom],center*3);
  for(let k=0;k<ring.length;k++){const a=ring[k],b=ring[(k+1)%ring.length],c=count+k,d=count+(k+1)%ring.length;vertices.set([vertices[a*3],vertices[a*3+1],bottom],c*3);faces.set([a,c,d,a,d,b,center,d,c],p);p+=9;}
  return {vertices,faces};
}
export function castingMolds(vertices,faces,settings={},progress=()=>{}){
  const box=bounds(vertices),thickness=Number(settings.thickness??4),margin=14,base=8;
  let step=Number(settings.moldResolution??.6);if(!(step>=.15&&step<=2)||!(thickness>=.5&&thickness<=10))throw Error('模具采样或厚度不在有效范围');
  // Keep memory bounded in a visitor's browser, reporting the actual sampling.
  step=Math.max(step,Math.sqrt((box.size[0]+2*margin)*(box.size[1]+2*margin)/180000));
  const nx=Math.ceil((box.size[0]+2*margin)/step)+1,ny=Math.ceil((box.size[1]+2*margin)/step)+1,x0=box.center[0]-(nx-1)*step/2,y0=box.center[1]-(ny-1)*step/2;
  progress('采样光滑的脸部外表面',5);const {hi,lo}=raster(vertices,faces,nx,ny,x0,y0,step),mask=Uint8Array.from(hi,Number.isFinite);
  if(mask.reduce((a,b)=>a+b,0)<100)throw Error('正面可用表面过小，请检查朝向');
  const outside=floodBackground(mask,nx,ny),outline=Uint8Array.from(outside,x=>1-x),hole=Uint8Array.from(mask,(x,i)=>outline[i]&&!x?1:0),distance=edt(outline,nx,ny,true),inside=edt(mask,nx,ny,false);
  let low=Infinity;for(let i=0;i<hi.length;i++)if(mask[i])low=Math.min(low,hi[i]);
  const outer=new Float64Array(hi.length),unknown=new Uint8Array(hi.length);
  for(let i=0;i<hi.length;i++){if(mask[i])outer[i]=hi[i]-low+2;else if(hole[i]||distance[i]*step<margin-4)unknown[i]=1;}
  harmonic(outer,unknown,nx,ny);const filtered=smoothMeasured(outer,mask,nx,ny,step);outer.set(filtered);
  progress('生成内芯与合模边缘',35);const inner=new Float64Array(outer),r=Math.ceil(thickness/step),offsets=[];
  for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const q=(dx*dx+dy*dy)*step*step;if(q<=thickness*thickness)offsets.push([dx,dy,Math.sqrt(thickness*thickness-q)]);}
  for(let y=1;y<ny-1;y++)for(let x=1;x<nx-1;x++){const i=y*nx+x;if(!mask[i])continue;let value=Infinity;
    if(settings.sourceShell){value=lo[i]-low+2;}
    else for(const [dx,dy,z] of offsets){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<nx&&yy>=0&&yy<ny)value=Math.min(value,outer[yy*nx+xx]-z);}
    // Matching lands preserve eye/mouth openings and close the perimeter.
    const taper=Math.max(0,inside[i]*step-step/2)/Math.tan(5*Math.PI/180);
    inner[i]=Math.min(outer[i],Math.max(0,value,outer[i]-taper));
  }
  const nominalInner=new Float64Array(inner),nominalOuter=new Float64Array(outer);
  // Three asymmetric tapered locating pins and clearance pockets, on the
  // flange outside the casting. Grid sampling affects the stated clearance.
  const pins=[[x0+6,y0+6],[x0+(nx-1)*step-6,y0+6],[x0+6,y0+(ny-1)*step-6]];
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const i=y*nx+x,px=x0+x*step,py=y0+y*step;if(outline[i])continue;for(const [cx,cy] of pins){const d=Math.hypot(px-cx,py-cy);if(d<3.4){const h=Math.min(4,Math.max(0,(3.4-d)*4));inner[i]=Math.max(inner[i],h);outer[i]=Math.max(outer[i],Math.min(4.3,Math.max(0,(3.7-d)*4)));}}}
  // Feed at the chin, vents at the forehead. Channels follow the shared land
  // height and meet the cavity. Printed as rounded open grooves in both halves.
  const channel=(cx,yStart,yEnd,radius)=>{for(let y=0;y<ny;y++){const py=y0+y*step;if(py<yStart||py>yEnd)continue;for(let x=0;x<nx;x++){const dx=x0+x*step-cx;if(Math.abs(dx)>=radius)continue;const i=y*nx+x,d=Math.sqrt(radius*radius-dx*dx),land=nominalOuter[i];outer[i]=Math.max(outer[i],land+d);inner[i]=Math.min(inner[i],land-d);}}};
  const atX=cx=>Math.max(0,Math.min(nx-1,Math.round((cx-x0)/step))),edge=(cx,top)=>{const x=atX(cx),ys=[];for(let y=0;y<ny;y++)if(mask[y*nx+x])ys.push(y0+y*step);return top?Math.max(...ys):Math.min(...ys);};
  const cx=box.center[0];channel(cx,y0-1,edge(cx,false)+2,2);
  const ventX=[cx-box.size[0]*.18,cx,cx+box.size[0]*.18],ventRadius=Math.max(.65,step*1.2);for(const x of ventX)channel(x,edge(x,true)-2,y0+(ny-1)*step+1,ventRadius);
  progress('构建封闭阴模和阳模',65);let max=-Infinity;for(const z of outer)max=Math.max(max,z);const height=Math.ceil(max+base);
  const maleTop=Float64Array.from(inner,z=>z+base),femaleTop=new Float64Array(outer.length);
  // Rotate the female 180 degrees about X for printing, preserving chirality.
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)femaleTop[(ny-1-y)*nx+x]=height-outer[y*nx+x];
  // A Y reflection swaps each grid-cell diagonal. Swap it back so both
  // assembled shutoff lands use identical triangles instead of intersecting.
  const male=heightSolid(nx,ny,x0,y0,step,maleTop,0),female=heightSolid(nx,ny,x0,-(y0+(ny-1)*step),step,femaleTop,0,true);
  const maleQuality=meshQuality(male.vertices,male.faces),femaleQuality=meshQuality(female.vertices,female.faces);
  if([maleQuality,femaleQuality].some(q=>!q.watertight||!q.windingConsistent||!q.positiveVolume))throw Error('模具未通过封闭性或法线检查，已停止导出');
  let deviationMax=0,gapMin=Infinity,gapMax=0;for(let i=0;i<mask.length;i++)if(mask[i]){deviationMax=Math.max(deviationMax,Math.abs(nominalOuter[i]-(hi[i]-low+2)));const gap=nominalOuter[i]-nominalInner[i];gapMin=Math.min(gapMin,gap);gapMax=Math.max(gapMax,gap);}
  const report={units:'mm',method:'smoothed frontal draw envelope; harmonic parting apron; paired inner core',resolutionMm:step,gridDimensions:[nx,ny],sourceSizeMm:box.size,sourceOffsetZ:low-2,
    nominalSkinThicknessMm:settings.sourceShell?null:thickness,innerSurface:settings.sourceShell?'original shell back envelope':'Euclidean inward ball offset, tapered at openings',
    surfaceFilterMaxDeviationMm:deviationMax,axialCastingGapMm:[gapMin,gapMax],flangeMarginMm:margin,minimumBackMm:base,
    feedDiameterMm:4,foreheadVentDiameterMm:ventRadius*2,locatorRadialClearanceMm:.3,locatorHeightMm:4,clamping:'external clamps; no bolt holes',
    assemblyFromPrint:{male:{translation:[0,0,-base]},female:{rotationXDegrees:180,translation:[0,0,height]}},male:maleQuality,female:femaleQuality,
    limitations:['Front draw envelopes remove undercuts; exact original undercuts are not reproduced','No material shrinkage compensation','No physical casting or release test','Grid resolution limits locator clearance; sand/test before casting','Source shell mode preserves projected inner surface, not every undercut or mounting feature']};
  progress('模具检查完成',100);return {male,female,report};
}
