function CRC32() {
  this.crc = 0xffffffff;
  this.result = 0;
}

function crc32(arr, offs, size) {
  const crc = new CRC32();
  crc.read(arr, offs, size);

  return crc.result;
}

CRC32.TABLE = (function () {
  var table = [];

  for (let i = 0; i < 256; i++) {
    var crc = i;

    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }

    table.push(crc >>> 0);
  }

  return table;
})();

CRC32.prototype.reset = function () {
  this.crc = 0xffffffff;
};

CRC32.prototype.read = function (arr, offs, length) {
  for (let i = 0; i < length; i++) {
    this.crc =
      (CRC32.TABLE[(this.crc & 0xff) ^ arr[offs + i]] ^ (this.crc >>> 8)) >>> 0;
  }

  this.result = ~this.crc >>> 0;
};

module.exports = { crc32, CRC32 };
