// Tiny stack VM (ISA.md v1): 32-bit wrapping ints, 256-value data stack, 64-deep
// call stack, 256 words of memory, byte I/O (max 65536 out), 1,000,000 steps.
// One run answers every instance in MAKEFUN_INPUT_DIR, writing stdout.bin + exit.txt.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Immediate length per opcode; 255 = no such opcode (trap 5).
const IL = new Uint8Array(256).fill(255);
for (const o of [0, 3, 4, 5, 6, 7, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 32, 33, 34, 52, 64, 65, 80, 81, 82, 83]) IL[o] = 0;
IL[1] = 1; IL[2] = 4; IL[48] = 2; IL[49] = 2; IL[50] = 2; IL[51] = 2;

// Run one program. Returns [stdout Buffer, exit code].
function run(p, inp) {
  const s = new Int32Array(256);
  let sp = 0;
  const cs = new Int32Array(64);
  let cp = 0;
  const m = new Int32Array(256);
  const ob = new Uint8Array(65536);
  let ol = 0;
  let pc = 0, ip = 0, st = 0;
  const n = p.length;
  const buf = () => Buffer.from(ob.subarray(0, ol));
  for (;;) {
    if (st >= 1000000) return [buf(), 10];
    if (pc < 0 || pc >= n) return [buf(), 9];
    const o = p[pc];
    const il = IL[o];
    if (il === 255) return [buf(), 5];
    if (pc + 1 + il > n) return [buf(), 9];
    st++;
    switch (o) {
      case 0: return [buf(), 0];
      case 1: {
        if (sp >= 256) return [buf(), 3];
        const b = p[pc + 1];
        s[sp++] = b >= 128 ? b - 256 : b;
        pc += 2; break;
      }
      case 2: {
        if (sp >= 256) return [buf(), 3];
        s[sp++] = p[pc + 1] | (p[pc + 2] << 8) | (p[pc + 3] << 16) | (p[pc + 4] << 24);
        pc += 5; break;
      }
      case 3:
        if (sp < 1) return [buf(), 2];
        sp--; pc += 1; break;
      case 4:
        if (sp < 1) return [buf(), 2];
        if (sp >= 256) return [buf(), 3];
        s[sp] = s[sp - 1]; sp++; pc += 1; break;
      case 5:
        if (sp < 2) return [buf(), 2];
        { const t = s[sp - 1]; s[sp - 1] = s[sp - 2]; s[sp - 2] = t; }
        pc += 1; break;
      case 6:
        if (sp < 2) return [buf(), 2];
        if (sp >= 256) return [buf(), 3];
        s[sp] = s[sp - 2]; sp++; pc += 1; break;
      case 7:
        if (sp < 3) return [buf(), 2];
        { const a = s[sp - 3], b = s[sp - 2], c = s[sp - 1]; s[sp - 3] = b; s[sp - 2] = c; s[sp - 1] = a; }
        pc += 1; break;
      case 16: case 17: case 18: case 19: case 20: case 21: case 22:
      case 24: case 25: case 26: case 28: case 29: case 30: case 32: case 33: case 34: {
        if (sp < 2) return [buf(), 2];
        const b = s[sp - 1], a = s[sp - 2];
        let r;
        if (o === 16) r = (a + b) | 0;
        else if (o === 17) r = (a - b) | 0;
        else if (o === 18) r = Math.imul(a, b);
        else if (o === 19) { if (b === 0) return [buf(), 4]; r = Math.trunc(a / b) | 0; }
        else if (o === 20) { if (b === 0) return [buf(), 4]; r = (a % b) | 0; }
        else if (o === 21) { if (b === 0) return [buf(), 4]; r = Math.floor((a >>> 0) / (b >>> 0)) | 0; }
        else if (o === 22) { if (b === 0) return [buf(), 4]; r = ((a >>> 0) % (b >>> 0)) | 0; }
        else if (o === 24) r = a & b;
        else if (o === 25) r = a | b;
        else if (o === 26) r = a ^ b;
        else if (o === 28) r = a << (b & 31);
        else if (o === 29) r = a >> (b & 31);
        else if (o === 30) r = (a >>> (b & 31)) | 0;
        else if (o === 32) r = a === b ? 1 : 0;
        else if (o === 33) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        sp -= 2; s[sp++] = r; pc += 1; break;
      }
      case 23:
        if (sp < 1) return [buf(), 2];
        s[sp - 1] = (-s[sp - 1]) | 0; pc += 1; break;
      case 27:
        if (sp < 1) return [buf(), 2];
        s[sp - 1] = ~s[sp - 1]; pc += 1; break;
      case 48: {
        let off = p[pc + 1] | (p[pc + 2] << 8);
        if (off >= 32768) off -= 65536;
        pc = pc + 3 + off; break;
      }
      case 49: case 50: {
        if (sp < 1) return [buf(), 2];
        const v = s[--sp];
        let off = p[pc + 1] | (p[pc + 2] << 8);
        if (off >= 32768) off -= 65536;
        if ((o === 49 && v === 0) || (o === 50 && v !== 0)) pc = pc + 3 + off;
        else pc += 3;
        break;
      }
      case 51: {
        if (cp >= 64) return [buf(), 7];
        cs[cp++] = pc + 3;
        pc = p[pc + 1] | (p[pc + 2] << 8);
        break;
      }
      case 52:
        if (cp === 0) return [buf(), 8];
        pc = cs[--cp]; break;
      case 64: {
        if (sp < 1) return [buf(), 2];
        const addr = s[--sp];
        if (addr < 0 || addr > 255) return [buf(), 6];
        s[sp++] = m[addr]; pc += 1; break;
      }
      case 65: {
        if (sp < 2) return [buf(), 2];
        const addr = s[--sp], v = s[--sp];
        if (addr < 0 || addr > 255) return [buf(), 6];
        m[addr] = v; pc += 1; break;
      }
      case 80: {
        if (sp < 1) return [buf(), 2];
        const str = String(s[--sp]);
        if (ol + str.length > 65536) return [buf(), 11];
        for (let i = 0; i < str.length; i++) ob[ol++] = str.charCodeAt(i);
        pc += 1; break;
      }
      case 81: {
        if (sp < 1) return [buf(), 2];
        if (ol >= 65536) return [buf(), 11];
        ob[ol++] = s[--sp] & 255; pc += 1; break;
      }
      case 82:
        if (sp >= 256) return [buf(), 3];
        s[sp++] = ip < inp.length ? inp[ip++] : -1; pc += 1; break;
      case 83:
        if (sp < 1) return [buf(), 2];
        return [buf(), s[--sp] & 255];
    }
  }
}

for (const id of readdirSync(I).sort()) {
  const dir = join(I, id);
  let prog;
  try { prog = readFileSync(join(dir, 'program.bin')); } catch { continue; }
  let inp;
  try { inp = readFileSync(join(dir, 'input.bin')); } catch { inp = Buffer.alloc(0); }
  const [out, code] = run(prog, inp);
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), out);
  writeFileSync(join(O, id, 'exit.txt'), String(code) + '\n');
}
