// Redirect one include while retaining electron-builder's native two-pass
// uninstaller generation and verification. No dependency files are modified.
require('app-builder-lib'); // Initialize its normal entry point before subclass imports.
const { NsisTarget } = require('app-builder-lib/out/targets/nsis/NsisTarget');
const original = NsisTarget.prototype.computeFinalScript;
if (typeof original !== 'function') throw Error('electron-builder NSIS API changed; review the upgrade hook.');
NsisTarget.prototype.computeFinalScript = function(script, ...args) {
  const needle = '!include "installUtil.nsh"';
  if (script.split(needle).length !== 2) throw Error('NSIS template changed; review the upgrade hook.');
  return original.call(this, script.replace(needle, '!include "${BUILD_RESOURCES_DIR}\\generated-nsis\\installUtil.nsh"'), ...args);
};
require('electron-builder/cli');
