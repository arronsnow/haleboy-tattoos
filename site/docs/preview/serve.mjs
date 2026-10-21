// Zero-dependency server for the Jotform checkpoint preview.
// /form fetches the live Jotform form and injects jotform-haleboy.css, the way the
// Jotform designer will once the CSS is pasted in. Submissions are blocked in this preview.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const FORM_ID = '250787056108157';
const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/jotform-report.md': ['../jotform-report.md', 'text/plain; charset=utf-8'],
  '/jotform-haleboy.css': ['../../public/jotform-theme.css', 'text/css; charset=utf-8'],
};
const port = Number(process.env.PORT) || 4321;
const local = (p) => readFile(fileURLToPath(new URL(p, import.meta.url)));

// Stops the preview from creating a real entry in the shop inbox.
const blocker = `<script>(()=>{const bad=u=>{u=String(u);return u.includes("submit.jotform.com")||u.includes("/submit/")};
const f=window.fetch;window.fetch=(u,o)=>bad(u&&u.url||u)?Promise.reject(new Error('preview: submit blocked')):f(u,o);
const x=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u,...r){if(bad(u))throw new Error('preview: submit blocked');return x.call(this,m,u,...r)};})();</script>`;

async function themedForm(search) {
  const res = await fetch(`https://form.jotform.com/${FORM_ID}${search}`, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Jotform returned ${res.status}`);
  return (await res.text())
    .replace(`https://submit.jotform.com/submit/${FORM_ID}`, '/preview-blocked')
    .replace('<head>', `<head>${blocker}`)
    .replace('</head>', '<link rel="stylesheet" href="/jotform-haleboy.css"></head>');
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/form') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(await themedForm(url.search));
      return;
    }
    if (url.pathname === '/preview-blocked') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<body style="background:#000;color:#F4F2EE;font:17px sans-serif;padding:40px">Preview only: this request was not sent to Jotform.</body>');
      return;
    }
    const hit = files[url.pathname];
    if (!hit) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'content-type': hit[1] });
    res.end(await local(hit[0]));
  } catch (err) {
    res.writeHead(502, { 'content-type': 'text/plain' }).end(`Preview error: ${err.message}`);
  }
}).listen(port, () => console.log(`Jotform preview: http://localhost:${port}/`));
