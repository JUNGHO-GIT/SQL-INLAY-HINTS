/**
 * @file modules.ts
 * @description foo
 * @author Jungho
 * @since 2025-12-15
 */

import { logger } from "@exportScripts";
import _fs from "node:fs";
import _path from "node:path";

// -----------------------------------------------------------------------------------------
const _moduleCache: Map<string, any> = new Map();
let _extensionPath: string = ``;

// -----------------------------------------------------------------------------------------
const resolveModule = (moduleResult: unknown) => (moduleResult && typeof moduleResult === `object` && `default` in moduleResult ? moduleResult.default : moduleResult);

// -----------------------------------------------------------------------------------------
const resolveModulePath = (specifier: string) => {
	const basePath = _path.join(_extensionPath, `out`, `node_modules`, specifier);

	if (!_fs.existsSync(basePath)) {
		return specifier;
	}
	const packageJsonPath = _path.join(basePath, `package.json`);

	if (_fs.existsSync(packageJsonPath)) {
		try {
			const packageJson = JSON.parse(_fs.readFileSync(packageJsonPath, `utf8`));
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

// -----------------------------------------------------------------------------------------
const dynamicImport = async (specifier: string) => {
	const resolvedPath = resolveModulePath(specifier);

	try {
		const requiredModule = require(resolvedPath);
		return resolveModule(requiredModule);
	}
	catch {
		try {
			const fileUrl = _path.isAbsolute(resolvedPath) ? `file:///${resolvedPath.replaceAll(`\\`, `/`)}` : resolvedPath;
			const moduleResult = await import(fileUrl);
			return resolveModule(moduleResult);
		}
		catch {
			try {
				const fallbackModule = require(specifier);
				return resolveModule(fallbackModule);
			}
			catch (error: unknown) {
				logger(`error`, `dynamicImport - all attempts failed for ${specifier}: ${error.message}`);
				return null;
			}
		}
	}
};

// -----------------------------------------------------------------------------------------
export const setExtensionPath = (path: string) => {
	_extensionPath = path;
};

// -----------------------------------------------------------------------------------------
export const getModuleWithCache = async (moduleName: string) => {
	if (_moduleCache.has(moduleName)) {
		return _moduleCache.get(moduleName);
	}
	const moduleResult = await dynamicImport(moduleName);
	moduleResult && _moduleCache.set(moduleName, moduleResult);

	return _moduleCache.get(moduleName) || null;
};
