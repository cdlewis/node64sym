const { parentPort, workerData } = require("worker_threads");
const { CRC32 } = require("./crc32");

const SYM_NAME = 0;
const SYM_SIZE = 1;
const SYM_CRCA = 2;
const SYM_CRCB = 3;
const SYM_RELOCS = 4;

const REL_TYPE = 0;
const REL_NAME = 1;
const REL_OFFSETS = 2;

function Symbol(entry) {
  this.name = entry[SYM_NAME];
  this.size = entry[SYM_SIZE];
  this.crcA = entry[SYM_CRCA];
  this.crcB = entry[SYM_CRCB];
  this.relocs = entry[SYM_RELOCS];
}

const { binary, signatures, sigIndex, sigCount, offsets, thorough } =
  workerData;

for (let i = 0; i < sigCount; i++) {
  let symbol = new Symbol(signatures[sigIndex + i]);

  if (thorough) {
    for (
      var offset = 0;
      offset < binary.byteLength - symbol.size;
      offset += 4
    ) {
      if (testSymbol(binary, offset, symbol)) {
        parentPort.postMessage({
          status: "result",
          name: symbol.name,
          offset: offset,
        });

        break;
      }
    }
  } else {
    for (let j = 0; j < offsets.length; j++) {
      if (testSymbol(binary, offsets[j], symbol)) {
        parentPort.postMessage({
          status: "result",
          name: symbol.name,
          offset: offsets[j],
        });
        
        break;
      }
    }
  }

  parentPort.postMessage({ status: "progress" });
}

parentPort.postMessage({ status: "done" });

function readStrippedOpcode(binary, offset, relocType) {
  var opcode = binary.slice(offset, offset + 4);

  switch (relocType) {
    case "targ26":
      opcode[0] &= 0xfc;
      opcode[1] = 0x00;
      opcode[2] = 0x00;
      opcode[3] = 0x00;
      break;
    case "hi16":
    case "lo16":
      opcode[2] = 0x00;
      opcode[3] = 0x00;
      break;
  }

  return opcode;
}

function testSymbol(binary, offset, symbol) {
  let crcA = new CRC32();
  let crcB = new CRC32();

  if (symbol.relocs.length == 0) {
    crcA.read(binary, offset, Math.min(symbol.size, 8));
    crcB.read(binary, offset, symbol.size);
    return crcB.result == symbol.crcB;
  }

  // flattened relocs array
  const relocs = [];
  for (let reloc of symbol.relocs) {
    for (let offset of reloc[REL_OFFSETS]) {
      relocs.push({
        type: reloc[REL_TYPE],
        name: reloc[REL_NAME],
        offset: offset,
      });
    }
  }
  relocs.sort((a, b) => a.offset - b.offset);

  let nReloc = 0;
  let fnOffset = 0;
  const crcA_limit = Math.min(symbol.size, 8);

  while (fnOffset < crcA_limit && nReloc < relocs.length) {
    if (fnOffset < relocs[nReloc].offset) {
      // read up to relocated op or crcA limit
      const start = offset + fnOffset;
      const length = Math.min(relocs[nReloc].offset, crcA_limit) - fnOffset;
      crcA.read(binary, start, length);
      crcB.read(binary, start, length);
      fnOffset += length;
    } else if (fnOffset == relocs[nReloc].offset) {
      // read stripped relocated op
      const opcode = readStrippedOpcode(
        binary,
        offset + fnOffset,
        relocs[nReloc].type
      );
      crcA.read(opcode, 0, 4);
      crcB.read(opcode, 0, 4);
      fnOffset += 4;
      nReloc++;
    }
  }

  if (fnOffset < crcA_limit) {
    const length = crcA_limit - fnOffset;
    crcA.read(binary, offset + fnOffset, length);
    crcB.read(binary, offset + fnOffset, length);
    fnOffset += length;
  }

  if (crcA.result != symbol.crcA) {
    return false;
  }

  while (fnOffset < symbol.size && nReloc < relocs.length) {
    if (fnOffset < relocs[nReloc].offset) {
      // read up to relocated op
      crcB.read(binary, offset + fnOffset, relocs[nReloc].offset - fnOffset);
      fnOffset = relocs[nReloc].offset;
    } else if (fnOffset == relocs[nReloc].offset) {
      // strip and read relocated op
      const opcode = readStrippedOpcode(
        binary,
        offset + fnOffset,
        relocs[nReloc].type
      );
      crcB.read(opcode, 0, 4);
      fnOffset += 4;
      nReloc++;
    }
  }

  if (fnOffset < symbol.size) {
    crcB.read(binary, offset + fnOffset, symbol.size - fnOffset);
    fnOffset = symbol.size;
  }

  if (crcB.result == symbol.crcB) {
    const dv = new DataView(binary.buffer, offset);

    for (let i = 0; i < relocs.length; i++) {
      if (relocs[i].type == "targ26") {
        const jal = dv.getUint32(relocs[i].offset);
        const target = 0x80000000 + (jal & 0x3ffffff) * 4;

        parentPort.postMessage({
          status: "reloc_result",
          name: relocs[i].name,
          address: target,
        });
      } else if (
        relocs[i].type == "lo16" &&
        relocs[i - 1].type == "hi16" &&
        relocs[i].name == relocs[i - 1].name
      ) {
        const hi16 = dv.getUint16(relocs[i - 1].offset + 2);
        const lo16 = dv.getInt16(relocs[i - 0].offset + 2);
        const address = ((hi16 << 16) + lo16) >>> 0;

        parentPort.postMessage({
          status: "reloc_result",
          name: relocs[i].name,
          address: address,
        });
      }
    }

    return true;
  }
}
