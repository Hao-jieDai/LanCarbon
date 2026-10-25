// Keep the upstream NSIS template, with one explicit same-path upgrade hook.
// Fail closed if electron-builder changes the insertion points.
const fs = require('node:fs');
const path = require('node:path');
function prepareInstallerScript(root) {
  const templates = path.join(root, 'node_modules/app-builder-lib/templates/nsis');
  const output = path.join(root, 'build/generated-nsis');
  fs.mkdirSync(output, { recursive: true });
  const replaceOnce = (text, needle, replacement) => {
    if (text.split(needle).length !== 2) throw Error('NSIS template changed; review the in-place upgrade hook.');
    return text.replace(needle, replacement);
  };
  let utility = fs.readFileSync(path.join(templates, 'include/installUtil.nsh'), 'utf8');
  const hook = '  ${if} $installationDir == ""\n  ${andIf} $uninstallerFileName == ""';
  utility = utility.replace(/\r\n/g, '\n');
  utility = replaceOnce(utility, hook, '  !insertmacro LanCarbonTryInPlaceUpgrade\n\n' + hook);
  utility = '!include "${BUILD_RESOURCES_DIR}\\upgrade-in-place.nsh"\n' + utility;
  const utilFile = path.join(output, 'installUtil.nsh');
  fs.writeFileSync(utilFile, utility);
  const script = replaceOnce(fs.readFileSync(path.join(templates, 'installer.nsi'), 'utf8'), '!include "installUtil.nsh"', '!include "${BUILD_RESOURCES_DIR}\\generated-nsis\\installUtil.nsh"');
  const scriptFile = path.join(output, 'installer.nsi');
  fs.writeFileSync(scriptFile, script);
  return scriptFile;
}
module.exports = { prepareInstallerScript };
if (require.main === module) console.log(prepareInstallerScript(path.resolve(__dirname, '..')));
