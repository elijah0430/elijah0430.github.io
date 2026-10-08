// Isolated manual UI test: node tests/preview-editor.mjs, then /blog.html#write.
// No real credentials or network writes. This server only binds to loopback.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const body = 'A short introduction.\n\n::::toggle A closer look\n\nThe hidden explanation with $x_i^2$.\n\n:::toggle The derivation\n\n$$\n\\sum_{i=1}^{n} x_i\n$$\n\n:::\n\n::::\n\nContinue here.';
const setup = `<script>
if (new URLSearchParams(location.search).has('signedout')) localStorage.removeItem('jongwon-blog-session');
else localStorage.setItem('jongwon-blog-session', JSON.stringify({access_token:'local-ui-test',expires_at:Date.now()/1000+3600}));
if (!localStorage.getItem('jongwon-blog-draft-v1:new')) localStorage.setItem('jongwon-blog-draft-v1:new', JSON.stringify({title:'Notes on learning',summary:'',body:${JSON.stringify(body)},savedAt:Date.now()}));
const posts=[{id:'local-notes',slug:'local-notes',title:'Notes on learning',summary:'',body:${JSON.stringify(body)},published_at:'2026-10-03',updated_at:'2026-10-03'}];
window.fetch=async (url,options={})=>{
 let result=url.includes('blog_comments')?[]:posts;
 if (url.includes('/auth/')) result={access_token:'local-ui-test',expires_in:3600};
 else if (options.method==='POST') { result=[{...JSON.parse(options.body),id:'local-test',published_at:new Date().toISOString(),updated_at:new Date().toISOString()}]; posts.push(...result); }
 else if (options.method==='PATCH') { const post=posts.find(post=>post.id===new URL(url).searchParams.get('id').slice(3)); Object.assign(post,JSON.parse(options.body)); result=[post]; }
 return {ok:true,status:200,text:async()=>JSON.stringify(result)};
};
</script>`;
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.woff2':'font/woff2', '.woff':'font/woff', '.ttf':'font/ttf' };
http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (pathname === '/mobile') {
      res.writeHead(200, { 'Content-Type':'text/html' });
      res.end('<!doctype html><body style="margin:0;background:#ddd"><iframe title="Mobile editor" width="390" height="850" style="border:0" src="/blog.html#write"></iframe>'); return;
    }
    const file = resolve(root, '.' + (pathname === '/' ? '/blog.html' : pathname));
    if (!file.startsWith(resolve(root) + sep) || pathname.includes('node_modules') || pathname.includes('.git')) { res.writeHead(403); res.end(); return; }
    let data = await readFile(file);
    if (file.endsWith('blog.html')) data = data.toString().replace('<head>', () => '<head>' + setup);
    res.writeHead(200, { 'Content-Type':mime[extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store', 'Content-Security-Policy':"connect-src 'none'" });
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(4174, '127.0.0.1', () => console.log('Isolated preview: http://127.0.0.1:4174/blog.html#write'));
