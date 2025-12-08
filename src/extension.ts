// extension.ts

import { vscode, setExtensionPath } from "@exportLibs";
import { logger, initLogger } from "@exportScripts";
import { createInlayHintsProvider } from "@exportRules";

// -------------------------------------------------------------------------------------------------
export const activate = (context: vscode.ExtensionContext) => {

	// 0.init logger --------------------------------------------------
	initLogger();
	setExtensionPath(context.extensionPath);
	logger(`info`, `SQL-Inlay-Hints is now active!`);

	// 1.register inlay hints provider --------------------------------
	const inlayHintsProvider = createInlayHintsProvider();
	context.subscriptions.push(inlayHintsProvider);
	logger(`info`, `InlayHints Provider registered for SQL files`);
};

// -------------------------------------------------------------------------------------------------
export const deactivate = () => {
	logger(`info`, `SQL-Inlay-Hints is now deactivated`);
};
