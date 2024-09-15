const { N64Sym } = require("./n64sym");

const n64sym = new N64Sym();

n64sym.scan(process.argv[2]);

// format results for sm64tools
for (let r of n64sym.results) {
  console.log(`- [${r.address.toString(16)}, "${result.name}"\n`);
}
