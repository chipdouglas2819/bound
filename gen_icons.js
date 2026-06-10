// Generates the PWA icons (icon-512/192, apple-touch-icon) with zero dependencies —
// hand-rolled PNG encoder over node's zlib, art drawn per-pixel to match the game:
// dark void, faint arena boundary, glowing cyan player ring, white core.
// Run once after changing the art: node gen_icons.js
const fs = require('fs');
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++){
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf){
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data){
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(w, h, rgba){
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  const raw = Buffer.alloc((w*4 + 1) * h);
  for (let y = 0; y < h; y++){
    raw[y*(w*4+1)] = 0;  // filter: none
    rgba.copy(raw, y*(w*4+1)+1, y*w*4, (y+1)*w*4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function smooth(e0, e1, x){
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t*t*(3 - 2*t);
}

function renderIcon(S){
  const buf = Buffer.alloc(S*S*4);
  const cx = S/2, cy = S/2;
  const bg = [6,8,16], cyan = [94,233,255], white = [255,255,255], grey = [232,235,242];
  const arenaR = S*0.40, arenaW = S*0.008;   // faint boundary circle
  const ringR  = S*0.155, ringW = S*0.030;   // player ring
  const coreR  = S*0.058;                    // white core dot
  const glowSigma = S*0.09;

  for (let y = 0; y < S; y++){
    for (let x = 0; x < S; x++){
      const d = Math.hypot(x - cx + 0.5, y - cy + 0.5);
      let r = bg[0], g = bg[1], b = bg[2];

      const aA = (1 - smooth(arenaW, arenaW*2.4, Math.abs(d - arenaR))) * 0.22;
      r += (grey[0]-r)*aA; g += (grey[1]-g)*aA; b += (grey[2]-b)*aA;

      const gI = Math.exp(-Math.pow(Math.abs(d - ringR)/glowSigma, 2)) * 0.5;
      r = Math.min(255, r + cyan[0]*gI*0.55);
      g = Math.min(255, g + cyan[1]*gI*0.55);
      b = Math.min(255, b + cyan[2]*gI*0.55);

      const rA = 1 - smooth(ringW*0.5, ringW*0.5 + S*0.004, Math.abs(d - ringR));
      r += (cyan[0]-r)*rA; g += (cyan[1]-g)*rA; b += (cyan[2]-b)*rA;

      const cA = 1 - smooth(coreR - S*0.004, coreR + S*0.004, d);
      r += (white[0]-r)*cA; g += (white[1]-g)*cA; b += (white[2]-b)*cA;

      const i = (y*S + x) * 4;
      buf[i] = r|0; buf[i+1] = g|0; buf[i+2] = b|0; buf[i+3] = 255;
    }
  }
  return buf;
}

for (const [file, size] of [['icon-512.png', 512], ['icon-192.png', 192], ['apple-touch-icon.png', 180]]){
  fs.writeFileSync(__dirname + '/' + file, encodePNG(size, size, renderIcon(size)));
  console.log('wrote ' + file);
}
