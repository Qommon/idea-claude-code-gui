import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger';

const FILE_LIST_MAX_RESULTS = 200;
const FILE_LIST_MAX_DEPTH = 15;
const FILE_LIST_MAX_CHILDREN = 100;
const FILE_LIST_HIDDEN = new Set(['.DS_Store', '.git', 'node_modules', '.idea']);

interface FileListRequest {
  query?: string;
  currentPath?: string;
}

interface FileListItem {
  name: string;
  path: string;
  absolutePath: string;
  type: 'file' | 'directory';
  extension?: string;
}

/**
 * File Handler
 * Handles file operations using VSCode FileSystem API
 */
export class FileHandler {
  private static normalizeDisplayPath(value: string): string {
    return value.replace(/\\/g, '/');
  }

  private static shouldHideEntry(name: string): boolean {
    return FILE_LIST_HIDDEN.has(name);
  }

  private static buildFileItem(entry: fs.Dirent, entryPath: string, workspaceRoot: string): FileListItem {
    let relativePath = entryPath;
    if (workspaceRoot && entryPath.startsWith(workspaceRoot)) {
      relativePath = path.relative(workspaceRoot, entryPath);
    }

    const item: FileListItem = {
      name: entry.name,
      path: this.normalizeDisplayPath(relativePath),
      absolutePath: entryPath,
      type: entry.isDirectory() ? 'directory' : 'file',
    };

    if (!entry.isDirectory()) {
      const ext = path.extname(entry.name).replace('.', '');
      if (ext) {
        item.extension = ext;
      }
    }

    return item;
  }

  private static resolveBaseDir(workspaceRoot: string, currentPath?: string): string {
    const trimmed = (currentPath || '').trim();
    if (!trimmed) {
      return workspaceRoot;
    }

    if (path.isAbsolute(trimmed)) {
      return trimmed;
    }

    return path.join(workspaceRoot, trimmed);
  }

  private static async listDirectoryEntries(
    baseDir: string,
    workspaceRoot: string,
    query: string
  ): Promise<FileListItem[]> {
    const results: FileListItem[] = [];
    let entries: fs.Dirent[] = [];
    try {
      entries = await fs.promises.readdir(baseDir, { withFileTypes: true });
    } catch (error) {
      Logger.debug('[FileHandler] Failed to read directory:', baseDir, error);
      return results;
    }

    const lowerQuery = query.toLowerCase();
    for (const entry of entries) {
      if (this.shouldHideEntry(entry.name)) continue;
      if (lowerQuery && !entry.name.toLowerCase().includes(lowerQuery)) continue;
      const entryPath = path.join(baseDir, entry.name);
      results.push(this.buildFileItem(entry, entryPath, workspaceRoot));
      if (results.length >= FILE_LIST_MAX_CHILDREN) {
        break;
      }
    }

    return results;
  }

  private static async searchFilesRecursive(
    baseDir: string,
    workspaceRoot: string,
    query: string,
    results: FileListItem[],
    depth: number
  ): Promise<void> {
    if (depth > FILE_LIST_MAX_DEPTH || results.length >= FILE_LIST_MAX_RESULTS) {
      return;
    }

    let entries: fs.Dirent[] = [];
    try {
      entries = await fs.promises.readdir(baseDir, { withFileTypes: true });
    } catch {
      return;
    }

    const lowerQuery = query.toLowerCase();
    for (const entry of entries) {
      if (this.shouldHideEntry(entry.name)) continue;
      const entryPath = path.join(baseDir, entry.name);

      if (entry.name.toLowerCase().includes(lowerQuery)) {
        results.push(this.buildFileItem(entry, entryPath, workspaceRoot));
        if (results.length >= FILE_LIST_MAX_RESULTS) {
          return;
        }
      }

      if (entry.isDirectory()) {
        await this.searchFilesRecursive(entryPath, workspaceRoot, query, results, depth + 1);
        if (results.length >= FILE_LIST_MAX_RESULTS) {
          return;
        }
      }
    }
  }

  public static async listFiles(request: FileListRequest, workspaceRoot?: string): Promise<FileListItem[]> {
    const root = workspaceRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    if (!root) {
      return [];
    }

    const query = typeof request?.query === 'string' ? request.query.trim() : '';
    const baseDir = this.resolveBaseDir(root, request?.currentPath);

    try {
      const stats = await fs.promises.stat(baseDir);
      if (!stats.isDirectory()) {
        return [];
      }
    } catch {
      return [];
    }

    if (!query) {
      return this.listDirectoryEntries(baseDir, root, '');
    }

    const results: FileListItem[] = [];
    await this.searchFilesRecursive(baseDir, root, query, results, 0);
    return results;
  }

  /**
   * Open a file in the editor
   */
  public static async openFile(filePath: string, line?: number, column?: number): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(filePath);
      const document = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(document);

      if (line !== undefined) {
        const position = new vscode.Position(Math.max(0, line - 1), column || 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
          new vscode.Range(position, position),
          vscode.TextEditorRevealType.InCenter
        );
      }

      return true;
    } catch (error) {
      Logger.error('Failed to open file:', filePath, error);
      return false;
    }
  }

  /**
   * Read file content
   */
  public static async readFile(filePath: string): Promise<string | null> {
    try {
      const uri = vscode.Uri.file(filePath);
      const content = await vscode.workspace.fs.readFile(uri);
      return Buffer.from(content).toString('utf-8');
    } catch (error) {
      Logger.error('Failed to read file:', filePath, error);
      return null;
    }
  }

  /**
   * Write file content
   */
  public static async writeFile(filePath: string, content: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(filePath);
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
      return true;
    } catch (error) {
      Logger.error('Failed to write file:', filePath, error);
      return false;
    }
  }

  /**
   * Check if file exists
   */
  public static async exists(filePath: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(filePath);
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Refresh file from disk (reload in editor if open)
   */
  public static async refreshFile(filePath: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(filePath);

      // Find if the file is already open
      const openEditor = vscode.window.visibleTextEditors.find(
        editor => editor.document.uri.fsPath === filePath
      );

      if (openEditor) {
        // Revert the document to reload from disk
        await vscode.commands.executeCommand('workbench.action.files.revert', uri);
      }

      return true;
    } catch (error) {
      Logger.error('Failed to refresh file:', filePath, error);
      return false;
    }
  }

  /**
   * Open browser/external URL
   */
  public static async openExternal(url: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.parse(url);
      await vscode.env.openExternal(uri);
      return true;
    } catch (error) {
      Logger.error('Failed to open external URL:', url, error);
      return false;
    }
  }
}
