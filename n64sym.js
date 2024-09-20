const fs = require("fs");
const { Worker } = require("node:worker_threads");
const os = require("os");
const { crc32 } = require("./crc32");
const { ProgressBar } = require("./progress-bar");
const signatures = require("./signatures");

class N64Sym {
  constructor() {
    this.binary = null;
    this.dvBinary = null;
    this.results = [];
    this.relocResults = [];
    this.likelyFunctionOffsets = [];
    this.numActiveWorkers = 0;
    this.numSignaturesScanned = 0;
    this.entryPoint = 0;
    this.endianCheck = 0;
    this.bRom = false;
    this.bootcheck = 0;
    this.bootcode = 0;
    this.bThoroughScan = true;
    this.progressBar = new ProgressBar(signatures.length);
    this.dispatch = {
      result: (message) => {
        this.addResult({ name: message.name, offset: message.offset });
      },
      reloc_result: (message) => {
        this.addResult({
          name: message.name,
          address: message.address,
        });
      },
      progress: () => {
        this.numSignaturesScanned++;
        this.progressBar.update(this.numSignaturesScanned);
      },
      done: () => {
        this.numActiveWorkers--;
        if (this.numActiveWorkers == 0) {
          this.callback(this.results);
        }
      },
    };
  }

  loadFile(filePath) {
    const fileBuffer = fs.readFileSync(filePath);
    this.binary = new Uint8Array(fileBuffer);
    this.dvBinary = new DataView(this.binary.buffer);
  }

  createScanWorker(workerData) {
    const worker = new Worker("./worker.js", { workerData });

    worker.on("message", (message) => {
      this.dispatch[message.status](message);
    });

    worker.on("error", (error) => {
      console.error("Worker error:", error);
    });

    return worker;
  }

  romEndianCheck() {
    this.endianCheck = this.dvBinary.getUint32(0x00);

    switch (this.endianCheck) {
      case 0x80371240:
        this.bRom = true;
        break;
      case 0x40123780:
        for (let i = 0; i < this.dvBinary.byteLength; i += 4) {
          this.dvBinary.setUint32(i, this.dvBinary.getUint32(i, true));
        }
        this.bRom = true;
        break;
      case 0x37804012:
        for (let i = 0; i < dvBinary.byteLength; i += 2) {
          this.dvBinary.setUint16(i, this.dvBinary.getUint16(i, true));
        }
        this.bRom = true;
        break;
    }
  }

  locateEntryPoint() {
    if (this.bRom) {
      this.entryPoint = this.dvBinary.getUint32(0x08) - 0x1000;
      this.bootcheck = crc32(this.binary, 0x40, 0xfc0);
      this.bootcode = 0;

      switch (this.bootcheck) {
        case 0x6170a4a1:
          this.bootcode = 6101;
          break;
        case 0x90bb6cb5:
          this.bootcode = 6102;
          break;
        case 0x0b050ee0:
          this.bootcode = 6103;
          this.entryPoint -= 0x100000;
          break;
        case 0x98bc2c86:
          this.bootcode = 6105;
          break;
        case 0xacc8580a:
          this.bootcode = 6106;
          this.entryPoint -= 0x200000;
          break;
      }
    }
  }

  collectLikelyFunctionOffsets() {
    let offsets = new Set();

    for (let offset = 0; offset < this.dvBinary.byteLength; offset += 4) {
      let word = this.dvBinary.getUint32(offset);

      // JR RA + 8
      if (word == 0x03e00008) {
        for (let i = 8; ; i += 4) {
          if (this.dvBinary.getUint32(offset + i) != 0x00000000) {
            offsets.add(offset + i);
            break;
          }
        }
      }

      // ADDIU SP, SP, -n
      if (
        (word & 0xffff0000) == 0x27bd0000 &&
        this.dvBinary.getInt16(offset + 2) < 0
      ) {
        offsets.add(offset);
      }
    }

    this.likelyFunctionOffsets = Array.from(offsets);
  }

  scan(filePath, callback) {
    this.loadFile(filePath);

    this.results = [];
    this.likelyFunctionOffsets = [];
    this.numSignaturesScanned = 0;
    this.bRom = false;
    this.callback = callback;

    this.romEndianCheck();
    this.locateEntryPoint();
    this.collectLikelyFunctionOffsets();
    const numCpuCores = os.cpus().length || 1;

    let sigIndex = 0;
    let sigsPerThread = (signatures.length / numCpuCores) | 0;
    let remainder = signatures.length % numCpuCores;

    for (let i = 0; i < numCpuCores; i++) {
      this.createScanWorker({
        binary: this.binary,
        signatures: signatures,
        sigIndex: sigIndex,
        sigCount: sigsPerThread + remainder,
        offsets: this.likelyFunctionOffsets,
        thorough: this.bThoroughScan,
      });
      this.numActiveWorkers++;

      sigIndex += sigsPerThread + remainder;

      if (remainder > 0) {
        remainder = 0;
      }
    }
  }

  addResult(result) {
    let resAddr = result.address || this.entryPoint + result.offset;

    for (let i in this.results) {
      let address =
        this.results[i].address || this.entryPoint + this.results[i].offset;
      if (resAddr == address) {
        return;
      }
    }

    this.results.push(result);

    this.results.sort((a, b) => {
      const addrA = a.address || a.offset + this.entryPoint;
      const addrB = b.address || b.offset + this.entryPoint;
      return addrA - addrB;
    });
  }
}

module.exports = { N64Sym };
