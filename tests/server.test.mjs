import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

test('本地预览正确返回页面、模块和错误，并阻止越界与 Git 文件访问', async () => {
  const module = await import('../scripts/serve.mjs').catch(() => null);
  assert.equal(typeof module?.createStaticServer, 'function', '需要独立的本地预览入口');
  const parent = await mkdtemp(path.join(tmpdir(), 'mayday-server-'));
  const root = path.join(parent,'site');
  await mkdir(path.join(root,'.git'),{recursive:true});
  await writeFile(path.join(root,'index.html'),'<h1>stage</h1>');
  await writeFile(path.join(root,'scene.mjs'),'export const ready=true;');
  await writeFile(path.join(root,'.git','config'),'private');
  await writeFile(path.join(parent,'outside.txt'),'outside');
  const server = module.createStaticServer(root);
  try {
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const index = await fetch(base+'/');
    assert.equal(index.status,200);
    assert.equal(await index.text(),'<h1>stage</h1>');
    const script = await fetch(base+'/scene.mjs?v=1');
    assert.equal(script.status,200);
    assert.match(script.headers.get('content-type'),/javascript/);
    assert.equal((await fetch(base+'/missing')).status,404);
    assert.equal((await fetch(base+'/.git/config')).status,404);
    assert.equal((await fetch(base+'/%2e%2e%2foutside.txt')).status,403);
    assert.equal((await fetch(base+'/',{method:'POST'})).status,405);
    assert.equal((await fetch(base+'/%E0%A4%A')).status,400);
    assert.equal((await fetch(base+'/',{method:'HEAD'})).status,200);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(parent,{recursive:true,force:true});
  }
});
