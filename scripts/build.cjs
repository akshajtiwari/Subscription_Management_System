const {cpSync,mkdirSync,rmSync} = require('node:fs');
const {join} = require('node:path');
const root=join(__dirname,'..');
const output=join(root,'dist');
rmSync(output,{recursive:true,force:true});
mkdirSync(output,{recursive:true});
for(const file of ['index.html','styles.css','model.js','app.js','workflows.js']){
  cpSync(join(root,'wireframes',file),join(output,file));
}
console.log('Built dist/');
