// Keep module/asset failures visible even when the application cannot initialize.
try {
  await import('./app.js');
  document.getElementById('startup-status').hidden=true;
} catch (failure) {
  const message=document.getElementById('startup-status');
  message.textContent='工具未能启动，请刷新或更换浏览器。'+(failure.message||String(failure));
  message.setAttribute('role','alert');
  document.getElementById('demo-button').disabled=true;
  document.getElementById('generate').disabled=true;
}
