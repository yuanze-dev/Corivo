/**
 * Corivo VS Code Extension
 */

import * as vscode from 'vscode';
import { CorivoAPI } from '@corivo/shared';

export function activate(context: vscode.ExtensionContext) {
  console.log('[corivo] Extension is now active!');

  const corivo = new CorivoAPI();

  // Register commands
  const saveCommand = vscode.commands.registerCommand('corivo.save', async () => {
    const input = await vscode.window.showInputBox({
      prompt: 'What do you want to remember?',
      placeHolder: 'e.g., I prefer 2-space indentation'
    });

    if (input) {
      const result = corivo.save(input, {
        annotation: '指令 · self · vscode'
      });

      if (result.success) {
        vscode.window.showInformationMessage(`[corivo] Saved: ${input.substring(0, 50)}...`);
      } else {
        vscode.window.showErrorMessage(`[corivo] Error: ${result.error}`);
      }
    }
  });

  const queryCommand = vscode.commands.registerCommand('corivo.query', async () => {
    const input = await vscode.window.showInputBox({
      prompt: 'Search memories...',
      placeHolder: 'e.g., code style'
    });

    if (input !== undefined) {
      const results = corivo.query(input, { limit: 10 });

      if (results.length === 0) {
        vscode.window.showInformationMessage('[corivo] No memories found');
      } else {
        // Show results in quick pick
        const items = results.map(r => ({
          label: r.annotation,
          description: r.content.substring(0, 100)
        }));
        await vscode.window.showQuickPick(items, {
          placeHolder: `[corivo] Found ${results.length} memories`
        });
      }
    }
  });

  const statusCommand = vscode.commands.registerCommand('corivo.status', () => {
    const stats = corivo.getStats();

    if (!stats) {
      vscode.window.showWarningMessage('[corivo] Database not initialized. Run: corivo init');
      return;
    }

    const message = `Total: ${stats.total} | Active: ${stats.active} | Cooling: ${stats.cooling} | Cold: ${stats.cold}`;
    vscode.window.showInformationMessage(`[corivo] ${message}`);
  });

  const initCommand = vscode.commands.registerCommand('corivo.init', () => {
    vscode.env.openExternal(vscode.Uri.parse('https://github.com/xiaolin26/Corivo#installation'));
  });

  // Status bar item
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'corivo.status';
  statusBarItem.show();

  // Update status bar
  const updateStatus = () => {
    const summary = corivo.getStatusSummary();
    statusBarItem.text = `$(database) ${summary}`;
  };

  updateStatus();
  const interval = setInterval(updateStatus, 60000); // Update every minute

  context.subscriptions.push(
    saveCommand,
    queryCommand,
    statusCommand,
    initCommand,
    statusBarItem,
    { dispose: () => clearInterval(interval) }
  );
}

export function deactivate() {
  console.log('[corivo] Extension deactivated');
}
