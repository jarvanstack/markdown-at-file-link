const path = require('path');
const vscode = require('vscode');

const CONFIG_SECTION = 'markdownAtFileLink';

class WorkspaceFileIndex {
  constructor(context) {
    this.files = [];
    this.dirty = true;
    this.refreshing = undefined;

    const watcher = vscode.workspace.createFileSystemWatcher('**/*');
    watcher.onDidCreate(() => this.markDirty(), undefined, context.subscriptions);
    watcher.onDidDelete(() => this.markDirty(), undefined, context.subscriptions);
    context.subscriptions.push(watcher);
  }

  markDirty() {
    this.dirty = true;
  }

  async getFiles() {
    if (!this.dirty && this.files.length > 0) {
      return this.files;
    }

    if (!this.refreshing) {
      this.refreshing = this.refresh();
    }

    try {
      await this.refreshing;
    } finally {
      this.refreshing = undefined;
    }

    return this.files;
  }

  async refresh() {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const maxFiles = config.get('maxFiles', 20000);
    const exclude = buildExcludePattern(config.get('exclude', []));
    const uris = await vscode.workspace.findFiles('**/*', exclude, maxFiles);

    this.files = uris
      .filter((uri) => uri.scheme === 'file')
      .map((uri) => toFileEntry(uri))
      .filter(Boolean)
      .sort((a, b) => a.workspacePath.localeCompare(b.workspacePath));
    this.dirty = false;
  }
}

class AtFileCompletionProvider {
  constructor(index) {
    this.index = index;
  }

  async provideCompletionItems(document, position) {
    const match = getAtMention(document, position);
    if (!match) {
      return undefined;
    }

    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const limit = config.get('maxSuggestions', 200);
    const files = await this.index.getFiles();
    const matches = rankFiles(files, match.query, limit);

    const items = matches.map((matched, index) => {
      const file = matched.file;
      const item = new vscode.CompletionItem(file.workspacePath, vscode.CompletionItemKind.File);
      item.detail = file.workspacePath;
      item.documentation = new vscode.MarkdownString(`Insert link to \`${file.workspacePath}\`.`);
      item.insertText = buildInsertText(document, file);
      item.range = match.range;
      item.filterText = `@${file.workspacePath} ${file.name}`;
      item.sortText = String(index).padStart(5, '0');
      item.preselect = index === 0;
      return item;
    });

    return new vscode.CompletionList(items, true);
  }
}

function activate(context) {
  const index = new WorkspaceFileIndex(context);
  const provider = new AtFileCompletionProvider(index);

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { language: 'markdown', scheme: 'file' },
      provider,
      '@'
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('markdownAtFileLink.insertFileLink', async () => {
      await insertFileLinkFromQuickPick(index);
    })
  );
}

function deactivate() {}

async function insertFileLinkFromQuickPick(index) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const files = await index.getFiles();
  const picked = await vscode.window.showQuickPick(
    files.map((file) => ({
      label: file.name,
      description: file.workspacePath,
      file
    })),
    {
      matchOnDescription: true,
      placeHolder: 'Search workspace file'
    }
  );

  if (!picked) {
    return;
  }

  const text = buildInsertText(editor.document, picked.file);
  await editor.edit((editBuilder) => {
    for (const selection of editor.selections) {
      editBuilder.replace(selection, text);
    }
  });
}

function toFileEntry(uri) {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder) {
    return undefined;
  }

  const relativePath = toPosix(path.relative(folder.uri.fsPath, uri.fsPath));
  const workspacePath = needsFolderPrefix() ? `${folder.name}/${relativePath}` : relativePath;

  return {
    uri,
    name: path.basename(uri.fsPath),
    relativePath,
    workspacePath
  };
}

function getAtMention(document, position) {
  const line = document.lineAt(position.line).text;
  const beforeCursor = line.slice(0, position.character);
  const atIndex = beforeCursor.lastIndexOf('@');

  if (atIndex < 0) {
    return undefined;
  }

  const previous = atIndex > 0 ? beforeCursor[atIndex - 1] : '';
  if (previous && /[A-Za-z0-9_]/.test(previous)) {
    return undefined;
  }

  const query = beforeCursor.slice(atIndex + 1);
  if (/\s/.test(query)) {
    return undefined;
  }

  return {
    query,
    range: new vscode.Range(position.line, atIndex, position.line, position.character)
  };
}

function rankFiles(files, query, limit) {
  const normalizedQuery = normalize(query);
  const ranked = [];

  for (const file of files) {
    const score = scoreFile(file, normalizedQuery);
    if (score === undefined) {
      continue;
    }
    ranked.push({ file, score });
  }

  return ranked
    .sort((a, b) => b.score - a.score || a.file.workspacePath.localeCompare(b.file.workspacePath))
    .slice(0, limit);
}

function scoreFile(file, query) {
  if (!query) {
    return 1;
  }

  const name = normalize(file.name);
  const workspacePath = normalize(file.workspacePath);

  if (name === query) {
    return 10000 - name.length;
  }
  if (workspacePath === query) {
    return 9500 - workspacePath.length;
  }
  if (name.startsWith(query)) {
    return 9000 - name.length;
  }
  if (workspacePath.startsWith(query)) {
    return 8500 - workspacePath.length;
  }
  if (name.includes(query)) {
    return 7000 - name.indexOf(query);
  }
  if (workspacePath.includes(query)) {
    return 6500 - workspacePath.indexOf(query);
  }

  const fuzzy = fuzzyScore(workspacePath, query);
  if (fuzzy !== undefined) {
    return fuzzy;
  }

  return fuzzyScore(name, query);
}

function fuzzyScore(value, query) {
  let searchFrom = 0;
  let score = 4000;

  for (const char of query) {
    const index = value.indexOf(char, searchFrom);
    if (index < 0) {
      return undefined;
    }
    score -= index - searchFrom;
    searchFrom = index + 1;
  }

  return score - value.length;
}

function buildInsertText(document, file) {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const target = getTargetPath(document, file.uri);

  if (config.get('insertStyle', 'markdownLink') === 'plainPath') {
    return target;
  }

  const linkText = config.get('linkText', 'relativePath') === 'fileName'
    ? file.name
    : file.workspacePath;

  return `[${escapeMarkdownLinkText(linkText)}](${formatMarkdownTarget(target)})`;
}

function getTargetPath(document, targetUri) {
  if (document.uri.scheme !== 'file') {
    const folder = vscode.workspace.getWorkspaceFolder(targetUri);
    return folder ? toPosix(path.relative(folder.uri.fsPath, targetUri.fsPath)) : targetUri.fsPath;
  }

  const fromDir = path.dirname(document.uri.fsPath);
  const relativePath = path.relative(fromDir, targetUri.fsPath);
  return toPosix(relativePath || path.basename(targetUri.fsPath));
}

function formatMarkdownTarget(target) {
  if (/[\s()<>]/.test(target)) {
    return `<${target.replace(/>/g, '%3E')}>`;
  }
  return target;
}

function escapeMarkdownLinkText(text) {
  return text.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

function buildExcludePattern(patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) {
    return undefined;
  }
  return `{${patterns.join(',')}}`;
}

function needsFolderPrefix() {
  return Array.isArray(vscode.workspace.workspaceFolders) && vscode.workspace.workspaceFolders.length > 1;
}

function normalize(value) {
  return value.toLowerCase();
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

module.exports = {
  activate,
  deactivate
};
