/**
 * @file ExportLibs.ts
 * @description 외부 라이브러리 및 유틸리티
 * @author Jungho
 * @since 2025-12-8
 */

// -----------------------------------------------------------------------------------------
import _vscode from "vscode";
import _fs from "fs";
import _path from "path";
import { TextDecoder as _TextDecoder } from "util";
import { setExtensionPath as _setExtensionPath } from "@scripts/modules";
import { getModuleWithCache as _getModuleWithCache } from "@scripts/modules";

// -----------------------------------------------------------------------------------------
export { _vscode as vscode };
export { _fs as fs };
export { _path as path };
export { _TextDecoder as TextDecoder };

// -----------------------------------------------------------------------------------------
export { _setExtensionPath as setExtensionPath };
export { _getModuleWithCache as getModuleWithCache };
