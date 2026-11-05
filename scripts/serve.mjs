import http from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const mime = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml',
  '.wasm':'application/wasm', '.md':'text/plain; charset=utf-8'
};

export function createStaticServer(directory) {
  const root = path.resolve(directory);
  return http.createServer(async (request,response) => {
    const fail = (status,message) => {response.writeHead(status,{'Content-Type':'text/plain; charset=utf-8'});response.end(message);};
    if (!['GET','HEAD'].includes(request.method)) {
      response.setHeader('Allow','GET, HEAD');
      return fail(405,'Method not allowed');
    }
    let pathname;
    try {pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);}
    catch {return fail(400,'Invalid URL');}
    let target=path.resolve(root,'.'+pathname);
    const relative=path.relative(root,target);
    if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative)) return fail(403,'Forbidden');
    if(pathname.split(/[\\/]/).some(part=>part.startsWith('.')&&part!=='.'&&part!=='..')) return fail(404,'Not found');
    try {
      if((await stat(target)).isDirectory()) target=path.join(target,'index.html');
      const data=await readFile(target);
      response.writeHead(200,{'Content-Type':mime[path.extname(target).toLowerCase()]||'application/octet-stream','Content-Length':data.length,'Cache-Control':'no-cache'});
      response.end(request.method==='HEAD'?undefined:data);
    } catch(error) {
      fail(['ENOENT','ENOTDIR','EISDIR'].includes(error.code)?404:500,'File unavailable');
    }
  });
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  const root=fileURLToPath(new URL('../',import.meta.url)),port=Number(process.env.PORT||8000);
  if(!Number.isInteger(port)||port<1||port>65535) throw new Error('PORT 必须为 1—65535 的整数。');
  const server=createStaticServer(root);
  server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`端口 ${port} 已占用，请设置 PORT 后重试。`:error.message);process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log(`打开 http://127.0.0.1:${port}/ ，按 Ctrl+C 停止预览。`));
}
