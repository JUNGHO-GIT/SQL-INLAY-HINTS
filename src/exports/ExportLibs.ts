/**
 * @file ExportLibs.ts
 * @description 외부 라이브러리 및 유틸리티
 * @author Jungho
 * @since 2025-12-8
 */

// ―――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
export { default as fs } from "node:fs";
export { default as path } from "node:path";
export { TextDecoder } from "node:util";
export { gtModWthCch as getModuleWithCache, stExtPth as setExtensionPath } from "@scripts/modules";
export { default as vscode } from "vscode";
