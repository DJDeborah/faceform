// Parse only the eight numeric arrays publicly released by SCULPTOR. This is
// a data reader, not a pickle interpreter: no callable is ever executed.
const KEYS = new Set(['skullmesh_face','facialmesh_face','template_skull','template_face','skull_shape','face_shape','skull_div','face_div']);
export function readSculptor(buffer) {
  const bytes=new Uint8Array(buffer), view=new DataView(buffer), decoder=new TextDecoder();
  if(decoder.decode(bytes.subarray(1,6))!=='NUMPY') throw new Error('模型文件格式不正确');
  let p=bytes[6]===1?10+view.getUint16(8,true):12+view.getUint32(8,true);
  const stack=[],memo=[],mark={},arrays={}; let pending=null;
  const u8=()=>bytes[p++], u32=()=>{const n=view.getUint32(p,true);p+=4;return n;};
  const line=()=>{const start=p;while(bytes[p]!==10&&p<bytes.length)p++;return decoder.decode(bytes.subarray(start,p++));};
  const tuple=n=>stack.splice(stack.length-n,n);
  const popmark=()=>{const i=stack.lastIndexOf(mark);if(i<0)throw Error('Invalid model tuple');return stack.splice(i).slice(1);};
  while(p<bytes.length) {
    const op=u8();
    if(op===128){if(u8()>3)throw Error('Unsupported model protocol');}
    else if(op===99)stack.push({global:line()+' '+line()});
    else if(op===113)memo[u8()]=stack.at(-1);
    else if(op===114)memo[u32()]=stack.at(-1);
    else if(op===104)stack.push(memo[u8()]);
    else if(op===106)stack.push(memo[u32()]);
    else if(op===40)stack.push(mark);
    else if(op===75)stack.push(u8());
    else if(op===77){stack.push(view.getUint16(p,true));p+=2;}
    else if(op===74){stack.push(view.getInt32(p,true));p+=4;}
    else if(op===78)stack.push(null);
    else if(op===136)stack.push(true);
    else if(op===137)stack.push(false);
    else if(op===41)stack.push([]);
    else if(op===93)stack.push([]);
    else if(op===125)stack.push({});
    else if(op===88){const n=u32();const s=decoder.decode(bytes.subarray(p,p+n));p+=n;stack.push(s);if(KEYS.has(s))pending=s;}
    else if(op===67||op===66){const n=op===67?u8():u32();stack.push({offset:p,length:n});p+=n;}
    else if(op===133)stack.push(tuple(1));
    else if(op===134)stack.push(tuple(2));
    else if(op===135)stack.push(tuple(3));
    else if(op===116)stack.push(popmark());
    else if(op===97){const item=stack.pop();stack.at(-1).push(item);}
    else if(op===82){
      const args=stack.pop(),constructor=stack.pop();
      if(constructor?.global==='numpy dtype')stack.push({dtype:args[0]});
      else if(constructor?.global==='numpy.core.multiarray _reconstruct')stack.push({array:true});
      else throw Error('Unexpected callable in numeric model. Reader stopped.');
    }
    else if(op===98){
      const state=stack.pop(),obj=stack.at(-1);
      if(obj?.dtype){obj.order=state[1];continue;}
      if(obj?.array&&pending){
        const [,shape,dtype,fortran,payload]=state;
        if(fortran||!payload||!Array.isArray(shape))throw Error('Unsupported numeric array');
        const count=shape.reduce((a,b)=>a*b,1),width=dtype.dtype==='f8'?8:dtype.dtype==='f4'?4:0;
        if(!width||count*width!==payload.length)throw Error('Invalid model array length');
        const data=new Float32Array(count),little=dtype.order!=='>';
        for(let i=0;i<count;i++)data[i]=width===8?view.getFloat64(payload.offset+i*8,little):view.getFloat32(payload.offset+i*4,little);
        obj.shape=shape;obj.data=data;arrays[pending]=obj;pending=null;
        if(Object.keys(arrays).length===8)return prepareModel(arrays);
      }
    } else throw Error('Unexpected model opcode '+op);
  }
  throw Error('Incomplete model download');
}

export function prepareModel(a){
  function canonical(array){const out=new Float32Array(array.length);for(let i=0;i<array.length;i+=3){out[i]=-array[i];out[i+1]=array[i+2];out[i+2]=-array[i+1];}return out;}
  function faces(array,width){const out=[];for(let i=0;i<array.length;i+=width){out.push(array[i],array[i+2],array[i+1]);if(width===4&&array[i]!==array[i+3]&&array[i+2]!==array[i+3])out.push(array[i],array[i+3],array[i+2]);}return new Uint32Array(out);}
  function basis(div,shape){const output=new Float32Array(div.length+shape.length);output.set(canonical(div));output.set(canonical(shape),div.length);return output;}
  return {skin:canonical(a.template_face.data),skull:canonical(a.template_skull.data),
    skinFaces:faces(a.facialmesh_face.data,4),skullFaces:faces(a.skullmesh_face.data,3),
    skinBasis:basis(a.face_div.data,a.face_shape.data),skullBasis:basis(a.skull_div.data,a.skull_shape.data),n:60};
}

export function evaluate(base,basis,beta){const out=new Float32Array(base);for(let k=0;k<beta.length;k++){if(Math.abs(beta[k])<1e-10)continue;const offset=k*base.length;for(let i=0;i<base.length;i++)out[i]+=beta[k]*basis[offset+i];}return out;}

const MODEL_URLS=[
 'https://api.github.com/repos/sculptor2022/sculptor/contents/model/paradict.npy?ref=main',
 'https://raw.githubusercontent.com/sculptor2022/sculptor/main/model/paradict.npy'
];
async function database(){return new Promise((resolve,reject)=>{const r=indexedDB.open('faceform-models',1);r.onupgradeneeded=()=>r.result.createObjectStore('files');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function loadModel(progress=()=>{}){
  let db;try{db=await database();const cached=await new Promise(resolve=>{const r=db.transaction('files').objectStore('files').get('sculptor-081e696d');r.onsuccess=()=>resolve(r.result);r.onerror=()=>resolve(null);});if(cached){progress('读取浏览器中已缓存的模型',100);return readSculptor(cached);}}catch{}
  let last;
  for(const url of MODEL_URLS){try{
    progress('首次准备公开模型，约 80 MB',0);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),180000);
    let buffer;try{
      const response=await fetch(url,{headers:url.includes('api.github')?{Accept:'application/vnd.github.raw+json'}:{},signal:controller.signal});
      if(!response.ok)throw Error('HTTP '+response.status);
      const reader=response.body.getReader(),parts=[];let size=0;
      while(true){const {done,value}=await reader.read();if(done)break;parts.push(value);size+=value.length;if(size>90000000)throw Error('Unexpected model size');progress(`准备模型 ${(size/1048576).toFixed(1)} / 80 MB`,Math.min(99,size/83896164*100));}
      const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}buffer=bytes.buffer;
    }finally{clearTimeout(timer);}
    if(buffer.byteLength!==83896164)throw Error('模型文件不完整');
    // The full source blob is checked before this restricted data parser runs.
    const header=new TextEncoder().encode('blob '+buffer.byteLength+'\0');
    const hashInput=new Uint8Array(header.length+buffer.byteLength);hashInput.set(header);hashInput.set(new Uint8Array(buffer),header.length);
    const digest=await crypto.subtle.digest('SHA-1',hashInput);
    const hex=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
    if(hex!=='081e696dcc0d4e3e64fe723ed5f7ffabe0762c26')throw Error('模型来源校验失败');
    const model=readSculptor(buffer);
    if(db){const tx=db.transaction('files','readwrite');tx.objectStore('files').put(buffer,'sculptor-081e696d');}
    progress('模型准备完成',100);return model;
  }catch(error){last=error;}}
  throw Error('公开模型下载失败，请检查网络后重试。'+(last?.message||''));
}
