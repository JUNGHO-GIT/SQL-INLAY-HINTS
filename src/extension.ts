/**
 * @file extension.ts
 * @description SQL-Inlay-Hints 확장 진입점
 * @author Jungho
 * @since 2025-12-8
 */

import { vscode } from "@exportLibs";
import { createInlayHintsProvider as crtInHnPr, createKeywordDecorator as crtKywrDcrt } from "@exportRules";
import { initLogger, logger } from "@exportScripts";

// 1. InlayHints 설정 변경 -----------------------------------------------------------------------
const setInlayHintsEnabled = async (enabled: boolean): Promise<void> => {
  const resource = vscode.window.activeTextEditor?.document.uri;
  const config = vscode.workspace.getConfiguration(`SQL-Inlay-Hints`, resource);
  const inspected = config.inspect<boolean>(`enableInlayHints`);
  const target = inspected?.workspaceFolderValue !== undefined
    ? vscode.ConfigurationTarget.WorkspaceFolder
    : inspected?.workspaceValue !== undefined
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
  await config.update(`enableInlayHints`, enabled, target);
};

// 2. 확장 활성화 --------------------------------------------------------------------------------
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

  // 탭 액션 명령 등록
  context.subscriptions.push(
    vscode.commands.registerCommand(`SQL-Inlay-Hints.toggleInlayHints`, () => {
      const config = vscode.workspace.getConfiguration(`SQL-Inlay-Hints`, vscode.window.activeTextEditor?.document.uri);
      return setInlayHintsEnabled(!config.get<boolean>(`enableInlayHints`, true));
    }),
    vscode.commands.registerCommand(`SQL-Inlay-Hints.enableInlayHints`, () => setInlayHintsEnabled(true)),
    vscode.commands.registerCommand(`SQL-Inlay-Hints.disableInlayHints`, () => setInlayHintsEnabled(false)),
  );

  // SQL 키워드 하이라이팅 등록
  const decorators = crtKywrDcrt();
  for (const decorator of decorators) {
    context.subscriptions.push(decorator);
  }
  logger(`info`, `Keyword Decorator registered (${decorators.length} decorators)`);
};

// 3. 확장 비활성화 -------------------------------------------------------------------------------
export const deactivate = () => {
  logger(`info`, `SQL-Inlay-Hints is now deactivated`);
};
