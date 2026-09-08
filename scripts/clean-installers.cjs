const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname,"../release");
const names = fs.readdirSync(root);
const pattern = /^LanCarbon-(\d+)\.(\d+)\.(\d+)-x64-Setup\.exe$/;
const installers = names.flatMap(name => {
  const match = pattern.exec(name);
  return match ? [{name,version:match.slice(1).map(Number)}] : [];
}).sort((a,b) => b.version[0]-a.version[0] || b.version[1]-a.version[1] || b.version[2]-a.version[2]);
const current = require("../package.json").version;
if (!installers.some(item=>item.version.join(".")===current)) throw new Error("Current installer is missing; keep rollback installers.");
const currentParts = current.split(".").map(Number);
// 1.1.0 was an internal, withdrawn build and is intentionally not a rollback candidate.
const releasableInstallers = installers.filter(item => item.version.join(".") !== "1.1.0");
const retained = current === "1.0.0"
  ? releasableInstallers.filter(item => ["1.0.0", "2.5.0"].includes(item.version.join(".")))
  : currentParts[0] === 1
    ? releasableInstallers.filter(item => item.version[0] === 1).slice(0,3)
    : releasableInstallers.slice(0,3);
const retainedNames = new Set(retained.map(item => item.name));
for (const item of installers.filter(item => !retainedNames.has(item.name))) {
  for (const name of [item.name,item.name+".blockmap"]) {
    const file=path.resolve(root,name);
    if(path.dirname(file)!==root)throw new Error("Invalid installer path");
    if(fs.existsSync(file))fs.unlinkSync(file);
  }
}
console.log("Retained installers:\n"+retained.map(item=>item.name).join("\n"));
