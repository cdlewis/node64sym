const { N64Sym } = require("./n64sym");

const n64sym = new N64Sym();

n64sym.scan(process.argv[2], (results) => {
  // format results for sm64tools
  for (let r of n64sym.results) {
    var address = r.address || n64sym.entryPoint + r.offset;
    console.log(`- [${address.toString(16).toUpperCase()}, "${r.name}"]`);
  }
});
