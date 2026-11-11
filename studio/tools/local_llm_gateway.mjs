// Explicit, loopback-only OpenAI-compatible model binding for the browser host.
// No remote endpoints, implicit secrets, arbitrary proxy paths, or model guesses.
const MAX_BODY = 2 * 1024 * 1024;
const MAX_OUTPUT = 8 * 1024 * 1024;

const json = (res, status, body) => {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'content-type':'application/json; charset=utf-8',
    'content-length':String(data.length),
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
  }).end(data);
};

export function configuredEndpoint(raw) {
  if (!raw) return null;
  let url;
  try { url = new URL(raw); } catch { throw new Error('Invalid FOUNDRY_LOCAL_LLM_URL'); }
  if (url.protocol !== 'http:' ||
      !['127.0.0.1','localhost','[::1]'].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash ||
      !['','/','/v1','/v1/'].includes(url.pathname)) {
    throw new Error('FOUNDRY_LOCAL_LLM_URL must be http://127.0.0.1:PORT/v1 with no credentials or query');
  }
  const base = new URL(url.origin + '/v1/');
  return base;
}

export function createLocalLLMBridge(raw) {
  const endpoint = configuredEndpoint(raw);
  const upstream = async (path, options = {}) => {
    const response = await fetch(new URL(path, endpoint), {
      ...options,
      redirect: 'error',
      signal: AbortSignal.timeout(120000),
    });
    const body = await response.text();
    if (body.length > MAX_OUTPUT) throw new Error('local model response exceeded limit');
    if (!response.ok) throw new Error('local model returned HTTP ' + response.status);
    return JSON.parse(body);
  };
  const models = async () => {
    if (!endpoint) return [];
    const response = await upstream('models');
    if (!Array.isArray(response.data)) throw new Error('invalid /v1/models response');
    return response.data.filter(m => m && typeof m.id === 'string' && m.id.length <= 512)
      .map(m => ({
        id:m.id,
        contextWindow:Number.isSafeInteger(m.max_model_len) && m.max_model_len > 0
          ? m.max_model_len
          : Number.isSafeInteger(m.context_length) && m.context_length > 0
            ? m.context_length : null,
      }));
  };
  const readBody = async req => {
    const buffers = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) throw new Error('request too large');
      buffers.push(chunk);
    }
    return JSON.parse(Buffer.concat(buffers).toString('utf8'));
  };
  return async function routeLocal(req,res,url,port) {
    if (!url.pathname.startsWith('/foundry/__local-llm/')) return false;
    // Local websites cannot silently use this as a general-purpose model proxy.
    const origin = req.headers.origin;
    const sameOrigin = 'http://127.0.0.1:' + port;
    const site = req.headers['sec-fetch-site'];
    if ((origin && origin !== sameOrigin) || (site && site !== 'same-origin' && site !== 'none')) {
      json(res,403,{error:'cross-origin model access refused'});
      return true;
    }
    if (req.method === 'OPTIONS') {
      json(res,405,{error:'CORS requests unsupported'});
      return true;
    }
    const path = url.pathname.slice('/foundry/__local-llm/'.length);
    if (!endpoint) {
      json(res,503,{error:'No local model endpoint configured. Set FOUNDRY_LOCAL_LLM_URL and restart the loopback server.'});
      return true;
    }
    try {
      if (path === 'models' && req.method === 'GET') {
        json(res,200,{data:await models(),endpoint:'loopback'});
        return true;
      }
      if (path === 'chat' && req.method === 'POST') {
        if (!(req.headers['content-type'] || '').startsWith('application/json')) {
          json(res,415,{error:'JSON request required'});
          return true;
        }
        const body = await readBody(req);
        if (typeof body.model !== 'string' || !Array.isArray(body.messages) ||
            body.messages.length === 0 || body.stream !== false) {
          json(res,400,{error:'model, messages and stream:false are required'});
          return true;
        }
        const available = await models();
        if (!available.some(m=>m.id===body.model)) {
          json(res,422,{error:'selected model is not served by the configured local endpoint'});
          return true;
        }
        // Forward only recognized text-chat fields; never arbitrary URLs or credentials.
        const messages = body.messages.map(m=>({role:m.role,content:m.content}));
        if (messages.some(m => !['system','user','assistant'].includes(m.role) ||
            typeof m.content !== 'string')) {
          json(res,400,{error:'text-only system/user/assistant messages required'});
          return true;
        }
        const max_tokens = Math.min(8192, Math.max(1, Number(body.max_tokens) || 2048));
        const result = await upstream('chat/completions', {
          method:'POST',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({model:body.model,messages,stream:false,max_tokens}),
        });
        const answer = result?.choices?.[0]?.message?.content;
        if (typeof answer !== 'string') throw new Error('local model returned no text completion');
        json(res,200,{model:body.model,content:answer,finish_reason:result.choices[0].finish_reason ?? null});
        return true;
      }
      json(res,404,{error:'unknown local model operation'});
    } catch (error) {
      json(res,503,{error:'local model unavailable: '+String(error.message || error)});
    }
    return true;
  };
}
