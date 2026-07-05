/**
 * @file extension.ts
 * @description SQL-Inlay-Hints 확장 진입점
 * @author Jungho
 * @since 2025-12-8
 */

import type { vscode } from "@exportLibs";
import { createInlayHintsProvider as crtInHnPr, createKeywordDecorator as crtKywrDcrt } from "@exportRules";
import { initLogger, logger } from "@exportScripts";

// 1. 확장 활성화 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――--
export const activate = (context: vscode.ExtensionContext) => {
  // 로거 초기화
  initLogger();
  logger(`info`, `SQL-Inlay-Hints is now active!`);

  // InlayHints Provider 등록 (SQL + XML)
  const providers = crtInHnPr();
  for (const provider of providers) {
    context.subscriptions.push(provider);
  }
  logger(`info`, `InlayHints Provider registered (${providers.length} providers)`);

  // SQL 키워드 하이라이팅 등록
  const decorators = crtKywrDcrt();
  for (const decorator of decorators) {
    context.subscriptions.push(decorator);
  }
  logger(`info`, `Keyword Decorator registered (${decorators.length} decorators)`);
};

// 2. 확장 비활성화 ――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――――-
export const deactivate = () => {
  logger(`info`, `SQL-Inlay-Hints is now deactivated`);
};
