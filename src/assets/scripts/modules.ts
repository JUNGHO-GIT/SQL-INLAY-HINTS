/**
 * @file modules.ts
 * @description foo
 * @author Jungho
 * @since 2025-12-15
 */

import _fs from "node:fs";
import _path from "node:path";
import { logger } from "@exportScripts";

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
const _moduleCache: Map<string, any> = new Map();
let _extPth: string = ``;

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
const rslvMod = (moduleResult: unknown) => (moduleResult && typeof moduleResult === `object` && `default` in moduleResult ? moduleResult.default : moduleResult);

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
const rslvModPth = (specifier: string) => {
  const basePath = _path.join(_extPth, `out`, `node_modules`, specifier);

  if (!_fs.existsSync(basePath)) {
  	return specifier;
  }
  const pckgJsnPth = _path.join(basePath, `package.json`);

  if (_fs.existsSync(pckgJsnPth)) {
    try {
      const packageJson = JSON.parse(_fs.readFileSync(pckgJsnPth, `utf8`));
      const mainFile = packageJson.main ? packageJson.main : packageJson.exports?.default ? packageJson.exports.default : `index.js`;
      return _path.join(basePath, mainFile);
    }
    catch {
      return _path.join(basePath, `index.js`);
    }
  }
  if (_fs.existsSync(_path.join(basePath, `index.js`))) {
  	return _path.join(basePath, `index.js`);
  }
  return basePath;
};

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
const dynmImpr = async (specifier: string) => {
  const resolvedPath = rslvModPth(specifier);

  try {
    // biome-ignore lint/style/noCommonJs: packaged VS Code module fallback
    const rqrdMod = require(resolvedPath);
    return rslvMod(rqrdMod);
  }
  catch {
    try {
      const fileUrl = _path.isAbsolute(resolvedPath) ? `file:///${resolvedPath.replaceAll(`\\`, `/`)}` : resolvedPath;
      const moduleResult = await import(fileUrl);
      return rslvMod(moduleResult);
    }
    catch {
      try {
        // biome-ignore lint/style/noCommonJs: packaged VS Code module fallback
        const fbMod = require(specifier);
        return rslvMod(fbMod);
      }
      catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger(`error`, `dynamicImport - all attempts failed for ${specifier}: ${message}`);
        return null;
      }
    }
  }
};

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
export const stExtPth = (path: string) => {
  _extPth = path;
};

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
export const gtModWthCch = async (moduleName: string) => {
  if (_moduleCache.has(moduleName)) {
  	return _moduleCache.get(moduleName);
  }
  const moduleResult = await dynmImpr(moduleName);
  moduleResult && _moduleCache.set(moduleName, moduleResult);

  return _moduleCache.get(moduleName) || null;
};
