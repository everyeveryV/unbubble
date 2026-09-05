const MASK_64 = (1n << 64n) - 1n;
const ROTATION = [
  0, 1, 62, 28, 27,
  36, 44, 6, 55, 20,
  3, 10, 43, 25, 39,
  41, 45, 15, 21, 8,
  18, 2, 61, 56, 14,
];
const ROUND_CONSTANTS = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

function rotateLeft(value, amount) {
  if (amount === 0) return value & MASK_64;
  const shift = BigInt(amount);
  return ((value << shift) | (value >> (64n - shift))) & MASK_64;
}

function keccakF(state) {
  for (const constant of ROUND_CONSTANTS) {
    const columns = Array(5).fill(0n);
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) columns[x] ^= state[x + 5 * y];
    }
    const delta = columns.map((_, x) => columns[(x + 4) % 5] ^ rotateLeft(columns[(x + 1) % 5], 1));
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) state[x + 5 * y] = (state[x + 5 * y] ^ delta[x]) & MASK_64;
    }

    const moved = Array(25).fill(0n);
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) moved[y + 5 * ((2 * x + 3 * y) % 5)] = rotateLeft(state[x + 5 * y], ROTATION[x + 5 * y]);
    }
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        state[x + 5 * y] = (moved[x + 5 * y] ^ ((~moved[(x + 1) % 5 + 5 * y]) & moved[(x + 2) % 5 + 5 * y])) & MASK_64;
      }
    }
    state[0] ^= constant;
  }
}

export function keccak256(value) {
  const input = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
  const rate = 136;
  const paddedLength = Math.ceil((input.length + 1) / rate) * rate;
  const padded = new Uint8Array(paddedLength);
  padded.set(input);
  padded[input.length] ^= 0x01;
  padded[padded.length - 1] ^= 0x80;
  const state = Array(25).fill(0n);

  for (let offset = 0; offset < padded.length; offset += rate) {
    for (let lane = 0; lane < rate / 8; lane += 1) {
      let value64 = 0n;
      for (let byte = 0; byte < 8; byte += 1) value64 |= BigInt(padded[offset + lane * 8 + byte]) << BigInt(byte * 8);
      state[lane] ^= value64;
    }
    keccakF(state);
  }

  const output = new Uint8Array(32);
  for (let index = 0; index < output.length; index += 1) output[index] = Number((state[Math.floor(index / 8)] >> BigInt((index % 8) * 8)) & 0xffn);
  return [...output].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const word = (value) => BigInt(value).toString(16).padStart(64, '0');
const padBytes = (bytes) => {
  const value = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return value.padEnd(Math.ceil(value.length / 64) * 64, '0');
};

export function weightsToBps(weights, keys) {
  const values = keys.map((key) => Math.max(0, Number(weights[key]) || 0));
  const total = values.reduce((sum, value) => sum + value, 0) || 1;
  const result = values.map((value) => Math.floor(value / total * 10_000));
  result[result.length - 1] += 10_000 - result.reduce((sum, value) => sum + value, 0);
  return result;
}

export function encodePublishRecipe({ parentId, name, weightsBps, contentManifest }) {
  const signature = 'publishRecipe(uint256,string,uint16[6],bytes32)';
  const selector = keccak256(signature).slice(0, 8);
  const nameBytes = new TextEncoder().encode(name);
  const staticHeadWords = 9;
  const head = [
    word(parentId),
    word(staticHeadWords * 32),
    ...weightsBps.map(word),
    keccak256(contentManifest),
  ].join('');
  const dynamicName = `${word(nameBytes.length)}${padBytes(nameBytes)}`;
  return `0x${selector}${head}${dynamicName}`;
}
