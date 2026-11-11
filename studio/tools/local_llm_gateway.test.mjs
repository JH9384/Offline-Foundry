import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { configuredEndpoint, createLocalLLMBridge } from './local_llm_gateway.mjs';

async function listen(fn) {
  const server = createServer(fn);
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  return {server,port:server.address().port};
}
async function close(server) { await new Promise((res,rej)=>server.close(err=>err?rej(err):res())); }

test('binding refuses non-loopback, credentials, paths and implicit networks', () => {
  for (const invalid of [
    'https://127.0.0.1:8000/v1','http://192.168.1.1:8000/v1',
    'http://example.com/v1','http://127.0.0.1:8000/private',
    'http://user:secret@127.0.0.1:8000/v1',
  ]) assert.throws(()=>configuredEndpoint(invalid));
  assert.equal(configuredEndpoint(''),null);
  assert.equal(configuredEndpoint('http://127.0.0.1:8000/v1').href,'http://127.0.0.1:8000/v1/');
});

test('local model catalog and completion use actual upstream model ID',async()=>{
  const upstream=await listen(async(req,res)=>{
    res.setHeader('content-type','application/json');
    if(req.method==='GET'&&req.url==='/v1/models') {
      res.end(JSON.stringify({data:[{id:'mlx-community/Example-27B',max_model_len:16384}]}));
    } else if(req.method==='POST'&&req.url==='/v1/chat/completions') {
      const parts=[];
      for await(const chunk of req)parts.push(chunk);
      const query=JSON.parse(Buffer.concat(parts));
      assert.equal(query.model,'mlx-community/Example-27B');
      assert.equal(query.stream,false);
      res.end(JSON.stringify({choices:[{message:{content:'Local model answer'},finish_reason:'stop'}]}));
    } else res.writeHead(404).end();
  });
  const gateway=createLocalLLMBridge('http://127.0.0.1:'+upstream.port+'/v1');
  const local=await listen(async(req,res)=>{
    const u=new URL(req.url,'http://127.0.0.1');
    if(!await gateway(req,res,u,local.port))res.writeHead(404).end();
  });
  const base='http://127.0.0.1:'+local.port;
  try{
    const catalog=await fetch(base+'/foundry/__local-llm/models').then(r=>r.json());
    assert.deepEqual(catalog.data,[{id:'mlx-community/Example-27B',contextWindow:16384}]);
    const wrong=await fetch(base+'/foundry/__local-llm/chat',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({model:'not-running',messages:[{role:'user',content:'Hi'}],stream:false}),
    });
    assert.equal(wrong.status,422);
    const done=await fetch(base+'/foundry/__local-llm/chat',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({model:'mlx-community/Example-27B',messages:[{role:'user',content:'Hi'}],stream:false}),
    });
    assert.equal(done.status,200);
    assert.deepEqual(await done.json(),{model:'mlx-community/Example-27B',content:'Local model answer',finish_reason:'stop'});
    const cross=await fetch(base+'/foundry/__local-llm/models',{headers:{origin:'https://untrusted.example'}});
    assert.equal(cross.status,403);
  } finally {await close(local.server);await close(upstream.server);}
});

test('unconfigured binding fails closed',async()=>{
  const gateway=createLocalLLMBridge('');
  const server=await listen(async(req,res)=>{
    await gateway(req,res,new URL(req.url,'http://127.0.0.1'),server.port);
  });
  try{
    const response=await fetch('http://127.0.0.1:'+server.port+'/foundry/__local-llm/models');
    assert.equal(response.status,503);
  }finally{await close(server.server);}
});
