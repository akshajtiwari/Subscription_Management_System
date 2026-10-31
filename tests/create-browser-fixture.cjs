const {readFileSync,writeFileSync} = require('node:fs');
const {join} = require('node:path');
const root=join(__dirname,'..','wireframes');
const source=readFileSync(join(root,'index.html'),'utf8');
const fixture=source
  .replace('</head>','<style>.canvas.is-entering{animation:none!important}</style></head>')
  .replace('</body>','<script defer src="../tests/browser-verify.js"></script></body>');
writeFileSync(join(root,'.browser-smoke.html'),fixture);
console.log('Created wireframes/.browser-smoke.html');
