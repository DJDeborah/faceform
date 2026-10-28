import * as THREE from './three.module.js';
import {OrbitControls} from './OrbitControls.js';
import {OBJLoader} from './OBJLoader.js';
import {STLLoader} from './STLLoader.js';
import {PLYLoader} from './PLYLoader.js';
import {binarySTL} from './geometry.js';
const $=id=>document.getElementById(id);
let input=null,result=null,moldResult=null,ready=false,pending=false,resolveInit,rejectInit,initPromise,photoURL=null,mode='both',worker=null;
function error(message){$('progress-box').hidden=true;$('error-box').hidden=false;$('error-box').textContent=message;pending=false;updateControls();}
function updateControls(){ $('generate').disabled=!input||pending;$('demo-button').disabled=pending;for(const id of ['input-file','clear-file','profile','width','height','thickness'])$(id).disabled=pending;$('height').disabled=pending||$('profile').value==='morpheus';for(const id of ['download-skull','download-skin','download-report','generate-molds'])$(id).disabled=!result||pending;for(const id of ['download-female','download-male','download-mold-report'])$(id).disabled=!moldResult||pending; }
function clearResult(){result=null;moldResult=null;$('mold-status').textContent='先生成面皮，再生成配套阴阳模。';for(const id of ['skull-size','skin-size'])$(id).textContent='等待生成';for(const id of ['skull-quality','skin-quality'])$(id).textContent='—';$('result-state').textContent='等待生成';updateControls();}
function progress(text,percent){$('progress-box').hidden=false;$('error-box').hidden=true;$('progress-text').textContent=text;$('progress-percent').textContent=Math.round(percent)+'%';$('progress').value=percent;}
function createWorker(){
  const instance=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
  instance.onmessage=({data})=>{
  if(data.type==='progress')progress(data.text,data.percent);
  else if(data.type==='ready'){ready=true;resolveInit?.();resolveInit=rejectInit=null;if(!input&&!pending)showMeshes(data.skull,data.skullFaces,data.skin,data.skinFaces);}
  else if(data.type==='error'){rejectInit?.(new Error(data.message));resolveInit=rejectInit=null;if(!ready)initPromise=null;error(data.message);}
  else if(data.type==='result'){
    result=data;moldResult=null;pending=false;$('progress-box').hidden=true;showMeshes(data.skull,data.skullFaces,data.skin,data.skinFaces);setMode('both');updateControls();
    const size=v=>v.map(x=>x.toFixed(1)).join(' × ')+' mm';$('skull-size').textContent=size(data.report.skull.sizeMm);$('skin-size').textContent=size(data.report.faceSkin.sizeMm);
    $('skull-quality').textContent='封闭 · '+data.report.skull.triangles.toLocaleString()+' 面';$('skin-quality').textContent='封闭 · '+data.report.faceSkin.triangles.toLocaleString()+' 面';
    $('result-state').textContent=data.report.inputKind==='reference'?'参考模型已生成':'拟合与网格检查完成';
    $('result-description').textContent=data.report.inputKind==='reference'?'参考样例用于了解输出，不对应任何上传的人脸。':data.report.inputKind==='photo'?'照片已拟合为统计模型。隐藏骨骼来自学习先验。':'网格已完成形状拟合。请旋转检查面部朝向与形状。';
  }else if(data.type==='molds'){
    moldResult=data;pending=false;$('progress-box').hidden=true;
    if(group){for(const mesh of [...group.children])if(['female','male'].includes(mesh.name)){group.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}for(const name of ['female','male']){const part=data[name],mesh=new THREE.Mesh(geometry(part.vertices,part.faces),new THREE.MeshStandardMaterial({color:name==='female'?0x91afa9:0xc5c7ac,roughness:.65,side:THREE.DoubleSide}));mesh.name=name;group.add(mesh);}setMode('female');resetCamera();}
    $('mold-status').textContent='阴阳模已生成 · 工作面平滑偏差 ≤ '+data.report.surfaceFilterMaxDeviationMm.toFixed(2)+' mm · 采样 '+data.report.resolutionMm.toFixed(2)+' mm';updateControls();
  }
  };
  instance.onerror=e=>{
    const message='计算环境载入失败，请重试或更换浏览器。'+(e.message||'');
    rejectInit?.(new Error(message));resolveInit=rejectInit=null;ready=false;initPromise=null;
    instance.terminate();if(worker===instance)worker=null;error(message);
  };
  instance.onmessageerror=()=>instance.onerror({message:'计算数据传输失败'});
  return instance;
}
async function ensureModel(){
  if(ready)return;
  if(!initPromise){
    if(!worker){try{worker=createWorker();}catch(e){throw Error('无法启动浏览器计算环境：'+e.message);}}
    initPromise=new Promise((resolve,reject)=>{resolveInit=resolve;rejectInit=reject;worker.postMessage({type:'init'});});
  }
  try{return await initPromise;}catch(e){initPromise=null;resolveInit=rejectInit=null;throw e;}
}

const viewer=$('viewer');let scene,camera,renderer,controls,group;
try{
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(36,1,.1,3000);camera.position.set(0,10,700);
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;viewer.appendChild(renderer.domElement);
  controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.08;controls.minDistance=100;controls.maxDistance=1500;
  scene.add(new THREE.HemisphereLight(0xfffdf1,0x9aa08c,2.6));const key=new THREE.DirectionalLight(0xfff7e7,3.5);key.position.set(-250,300,400);scene.add(key);const fill=new THREE.DirectionalLight(0xe6eee3,1.2);fill.position.set(200,50,-200);scene.add(fill);
  group=new THREE.Group();scene.add(group);
  const resize=()=>{const {width,height}=viewer.getBoundingClientRect();renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();};new ResizeObserver(resize).observe(viewer);resize();
  renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
}catch(e){error('当前浏览器的 WebGL 不可用。请使用近期版本的 Chrome、Edge、Firefox 或 Safari。');}
function geometry(vertices,faces){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(vertices,3));g.setIndex(new THREE.BufferAttribute(faces,1));g.computeVertexNormals();return g;}
function showMeshes(skull,skullFaces,skin,skinFaces){if(!group)return;for(const child of [...group.children]){child.geometry.dispose();child.material.dispose();group.remove(child);}
  const bone=new THREE.Mesh(geometry(skull,skullFaces),new THREE.MeshStandardMaterial({color:0xc9c6ac,roughness:.7,side:THREE.DoubleSide}));bone.name='skull';
  const mask=new THREE.Mesh(geometry(skin,skinFaces),new THREE.MeshStandardMaterial({color:0xc68e6a,roughness:.63,transparent:true,opacity:.68,side:THREE.DoubleSide,depthWrite:false}));mask.name='skin';group.add(bone,mask);$('empty-view').hidden=true;setMode(mode);resetCamera();}
function resetCamera(){if(!group?.children.length)return;const box=new THREE.Box3().setFromObject(group),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),radius=Math.max(size.x,size.y,size.z);camera.position.copy(center).add(new THREE.Vector3(radius*.85,radius*.15,radius*2.3));controls.target.copy(center);controls.update();}
function setMode(value){mode=value;if(group){for(const obj of group.children){obj.visible=value==='both'?['skull','skin'].includes(obj.name):obj.name===value;if(obj.name==='skin'){obj.material.opacity=value==='skin'?1:.68;obj.material.depthWrite=value==='skin';}}}document.querySelectorAll('[data-view]').forEach(button=>{const active=button.dataset.view===value;button.classList.toggle('active',active);button.setAttribute('aria-pressed',active);});}
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>setMode(button.dataset.view)));
$('reset-camera').addEventListener('click',resetCamera);

async function parseMesh(file){const ext=file.name.split('.').at(-1).toLowerCase(),buffer=await file.arrayBuffer();let vertices=[];
  if(ext==='obj'){const object=new OBJLoader().parse(new TextDecoder().decode(buffer));object.updateMatrixWorld(true);object.traverse(child=>{if(child.isMesh){const attribute=child.geometry.getAttribute('position');const p=new THREE.Vector3();for(let i=0;i<attribute.count;i++){p.fromBufferAttribute(attribute,i).applyMatrix4(child.matrixWorld);vertices.push(p.x,p.y,p.z);}}});}
  else if(ext==='stl'||ext==='ply'){const g=ext==='stl'?new STLLoader().parse(buffer):new PLYLoader().parse(buffer);vertices=Array.from(g.getAttribute('position').array);g.dispose();}
  else throw Error('请选择 OBJ、PLY 或 STL 网格文件');
  if(vertices.length<90)throw Error('文件中没有找到可用的人脸网格');return new Float32Array(vertices);
}
async function selectFile(file){if(!file||pending)return;if(file.size>80*1024*1024){error('文件超过 80 MB，请先简化网格或缩小图片');return;}try{
  clearResult();$('error-box').hidden=true;if(photoURL){URL.revokeObjectURL(photoURL);photoURL=null;}
  if(file.type.startsWith('image/')){const bitmap=await createImageBitmap(file);if(bitmap.width<80||bitmap.height<80)throw Error('照片过小，请选择更清晰的照片');input={type:'image',file,bitmap};photoURL=URL.createObjectURL(file);$('input-preview').src=photoURL;$('input-preview').hidden=false;$('file-meta').textContent=bitmap.width+' × '+bitmap.height+' · 照片';}
  else {input={type:'mesh',file,vertices:await parseMesh(file)};$('input-preview').removeAttribute('src');$('input-preview').hidden=true;$('file-meta').textContent=(input.vertices.length/3).toLocaleString()+' 个顶点 · 3D 模型';}
  $('file-name').textContent=file.name;$('file-card').hidden=false;$('result-state').textContent='输入已就绪';$('result-description').textContent='设置目标尺寸后点击生成。';updateControls();
}catch(e){input=null;error('读取文件失败：'+e.message);}}
$('input-file').addEventListener('change',e=>selectFile(e.target.files[0]));
const zone=$('dropzone');for(const event of ['dragover','dragenter'])zone.addEventListener(event,e=>{e.preventDefault();zone.classList.add('drag-over');});for(const event of ['dragleave','drop'])zone.addEventListener(event,e=>{e.preventDefault();zone.classList.remove('drag-over');if(event==='drop')selectFile(e.dataTransfer.files[0]);});
zone.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('input-file').click();}});
$('clear-file').addEventListener('click',()=>{input=null;$('input-file').value='';$('file-card').hidden=true;clearResult();});
$('thickness').addEventListener('input',()=>{$('thickness-value').value=(+$('thickness').value).toFixed(1)+' mm';clearResult();});
for(const id of ['width','height'])$(id).addEventListener('change',clearResult);
$('profile').addEventListener('change',()=>{clearResult();$('calibration-note').textContent=$('profile').value==='morpheus'?'参考官方面皮宽度 175.43 mm，整张脸等比缩放；高度随人脸比例自动计算，见生成报告。此项为尺寸参考。':'输入目标面皮的外缘宽高。尺寸校准与真实机械贴合需分别核实。';if($('profile').value==='morpheus')$('width').value=175.43;updateControls();});

let landmarkerPromise;
async function photoLandmarks(bitmap){
  if(!landmarkerPromise)landmarkerPromise=(async()=>{const {FaceLandmarker,FilesetResolver}=await import('./vision_bundle.mjs');const files=await FilesetResolver.forVisionTasks(new URL('.',import.meta.url).href);return FaceLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:new URL('./face_landmarker.task',import.meta.url).href,delegate:'CPU'},runningMode:'IMAGE',numFaces:2,minFaceDetectionConfidence:.4,minFacePresenceConfidence:.4});})();
  const detector=await landmarkerPromise,ratio=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*ratio);canvas.height=Math.round(bitmap.height*ratio);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
  const detected=detector.detect(canvas);if(detected.faceLandmarks.length!==1)throw Error(detected.faceLandmarks.length?'照片包含多个人脸，请只保留一个人脸':'没有检测到人脸，请换成清晰的正面照片');return detected.faceLandmarks[0].map(p=>[p.x*canvas.width,p.y*canvas.height]);
}
async function generate(demo=false){try{
  const width=+$('width').value,height=+$('height').value,thickness=+$('thickness').value;if(!(width>=60&&width<=300&&height>=80&&height<=350&&thickness>=1&&thickness<=6))throw Error('请填写有效的面皮宽高与厚度');
  pending=true;updateControls();$('error-box').hidden=true;progress('准备公开模型',0);await ensureModel();
  let points=null;if(!demo&&input?.type==='image'){progress('识别人脸特征',20);points=await photoLandmarks(input.bitmap);}
  worker.postMessage({type:'generate',landmarks:points,vertices:!demo&&input?.type==='mesh'?input.vertices:null,settings:{width,height,thickness,profile:$('profile').value}});
}catch(e){error(e.message);}}
$('generate').addEventListener('click',()=>generate());$('demo-button').addEventListener('click',()=>generate(true));
function download(buffer,name,type){const url=URL.createObjectURL(new Blob([buffer],{type})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
$('download-skull').addEventListener('click',()=>{if(result)download(binarySTL(result.skull,result.skullFaces),'faceform_skull_estimate_mm.stl','model/stl');});
$('download-skin').addEventListener('click',()=>{if(result)download(binarySTL(result.skin,result.skinFaces),'faceform_face_skin_mm.stl','model/stl');});
$('download-report').addEventListener('click',()=>{if(result)download(JSON.stringify(result.report,null,2),'faceform_report.json','application/json');});
$('generate-molds').addEventListener('click',()=>{if(!result||pending)return;pending=true;updateControls();progress('准备浇注模具',0);worker.postMessage({type:'molds'});});
for(const name of ['female','male'])$('download-'+name).addEventListener('click',()=>{if(moldResult){const part=moldResult[name];download(binarySTL(part.vertices,part.faces),'faceform_'+name+'_casting_mold_mm.stl','model/stl');}});
$('download-mold-report').addEventListener('click',()=>{if(moldResult)download(JSON.stringify(moldResult.report,null,2),'faceform_mold_report.json','application/json');});
updateControls();
