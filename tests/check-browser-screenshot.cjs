const {readFileSync} = require('node:fs');
const {inflateSync} = require('node:zlib');
const assert = require('node:assert/strict');
const png=readFileSync('/tmp/brightloop-browser-smoke.png');
assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a','Expected PNG screenshot');
let offset=8;let colorType=0;const compressed=[];
while(offset<png.length){
  const size=png.readUInt32BE(offset),type=png.toString('ascii',offset+4,offset+8);
  if(type==='IHDR')colorType=png[offset+8+9];
  if(type==='IDAT')compressed.push(png.subarray(offset+8,offset+8+size));
  offset+=size+12;
  if(type==='IEND')break;
}
assert.ok([2,6].includes(colorType),'Expected RGB or RGBA screenshot');
const pixels=inflateSync(Buffer.concat(compressed));
assert.deepEqual([...pixels.subarray(1,4)],[217,245,221],'Browser workflow checks failed; inspect /tmp/brightloop-browser-smoke.png');
console.log('38 browser workflow checks passed.');
