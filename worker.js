import {loadModel,evaluate} from './model.js';
import {fitImage,fitMesh,facePatch,calibratePair,thickShell,meshQuality} from './geometry.js';
import {castingMolds} from './molds.js';
let model=null,reference=null,moldInput=null;
const progress=(text,percent)=>postMessage({type:'progress',text,percent});
self.onmessage=async({data})=>{try{
  if(data.type==='init'){
    reference=await fetch(new URL('./reference.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('特征基准载入失败');return r.json();});
    model=await loadModel(progress);
    postMessage({type:'ready',skin:new Float32Array(model.skin),skull:new Float32Array(model.skull),skinFaces:new Uint32Array(model.skinFaces),skullFaces:new Uint32Array(model.skullFaces)});
  }else if(data.type==='generate'){
    if(!model)throw Error('模型尚未准备好');
    const settings=data.settings;
    const fit=data.landmarks?fitImage(model,reference,data.landmarks,progress):data.vertices?fitMesh(model,data.vertices,reference,progress):{beta:new Float32Array(60),method:'neutral reference demo',scaleMeasured:false};
    progress('裁剪独立脸部面皮',80);
    const skin=evaluate(model.skin,model.skinBasis,fit.beta),skull=evaluate(model.skull,model.skullBasis,fit.beta);
    const patch=facePatch(model,skin,reference,settings),pair=calibratePair(skin,skull,patch,settings);
    moldInput={vertices:pair.patch,faces:patch.faces,settings};
    const shell=thickShell(pair.patch,patch.faces,settings.thickness);
    progress('检查网格与导出尺寸',94);
    const report={version:'0.1.0',inputKind:data.landmarks?'photo':data.vertices?'mesh':'reference',units:'mm',
      method:fit.method,fitResidual:fit.rmse??null,initialFitResidual:fit.initialRmse??null,fitResidualUnits:data.landmarks?'pixels':'source-model mm',
      photoReconstruction:'statistical estimate; hidden skull anatomy is not measured',
      mechanicalCalibration:{profile:settings.profile,widthMm:settings.width,heightMm:settings.height,skinThicknessMm:settings.thickness,status:'dimension reference only; mounting and mechanical fit unverified'},
      faceRegion:patch.region,skull:meshQuality(pair.skull,model.skullFaces),faceSkin:meshQuality(shell.vertices,shell.faces),
      limitations:['No individual muscle reconstruction','No CT ground truth','No physical print or silicone mounting validation','No independent self-intersection certification'],
      source:'https://github.com/sculptor2022/sculptor',license:'Original model terms apply; application code has separate MIT license'};
    if([report.skull,report.faceSkin].some(q=>!q.watertight||!q.windingConsistent||!q.positiveVolume))throw Error('网格未通过封闭性或法线检查，已停止 STL 导出');
    const payload={type:'result',skull:pair.skull,skullFaces:new Uint32Array(model.skullFaces),skin:shell.vertices,skinFaces:shell.faces,report};
    postMessage(payload,[payload.skull.buffer,payload.skullFaces.buffer,payload.skin.buffer,payload.skinFaces.buffer]);
  }else if(data.type==='molds'){
    if(!moldInput)throw Error('请先生成人脸和面皮');
    const molds=castingMolds(moldInput.vertices,moldInput.faces,moldInput.settings,progress);
    postMessage({type:'molds',...molds},[molds.male.vertices.buffer,molds.male.faces.buffer,molds.female.vertices.buffer,molds.female.faces.buffer]);
  }
}catch(error){postMessage({type:'error',message:error.message||String(error)});}};
