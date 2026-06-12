const path = require('path');
const vscode = require('vscode');

const CONFIG_SECTION = 'markdownAtFileLink';
const RECENT_FILES_KEY = 'recentWorkspaceFiles';
const MAX_RECENT_FILES = 100;

const MATCH_KIND = {
  EMPTY: 0,
  FUZZY: 1,
  SUBSTRING: 2,
  WORD_PREFIX: 3,
  PREFIX: 4,
  EXACT: 5
};

const EXACTNESS = {
  NONE: 0,
  WORD: 1,
  TARGET: 2
};

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
  constructor(index, recentFiles) {
    this.index = index;
    this.recentFiles = recentFiles;
  }

  async provideCompletionItems(document, position) {
    const match = getAtMention(document, position);
    if (!match) {
      return undefined;
    }

    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const limit = config.get('maxSuggestions', 200);
    const files = await this.index.getFiles();
    const matches = rankFiles(files, match.query, limit, this.recentFiles);

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
      item.command = {
        command: 'markdownAtFileLink.rememberFile',
        title: 'Remember File Link',
        arguments: [file.workspacePath]
      };
      return item;
    });

    return new vscode.CompletionList(items, true);
  }
}

class RecentFilesStore {
  constructor(context) {
    this.state = context.workspaceState;
    this.paths = normalizeRecentPaths(this.state ? this.state.get(RECENT_FILES_KEY, []) : []);
  }

  getRank(file) {
    const key = getRecentKey(file);
    if (!key) {
      return Number.POSITIVE_INFINITY;
    }

    const index = this.paths.indexOf(key);
    return index < 0 ? Number.POSITIVE_INFINITY : index;
  }

  async remember(file) {
    const key = getRecentKey(file);
    if (!key) {
      return;
    }

    this.paths = [
      key,
      ...this.paths.filter((pathKey) => pathKey !== key)
    ].slice(0, MAX_RECENT_FILES);

    if (this.state) {
      await this.state.update(RECENT_FILES_KEY, this.paths);
    }
  }
}

function activate(context) {
  const index = new WorkspaceFileIndex(context);
  const recentFiles = new RecentFilesStore(context);
  const provider = new AtFileCompletionProvider(index, recentFiles);

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { language: 'markdown', scheme: 'file' },
      provider,
      '@'
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('markdownAtFileLink.insertFileLink', async () => {
      await insertFileLinkFromQuickPick(index, recentFiles);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('markdownAtFileLink.rememberFile', async (workspacePath) => {
      await recentFiles.remember(workspacePath);
    })
  );
}

function deactivate() {}

async function insertFileLinkFromQuickPick(index, recentFiles) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const files = await index.getFiles();
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const limit = config.get('maxSuggestions', 200);
  const picked = await showRankedFileQuickPick(files, recentFiles, limit);

  if (!picked) {
    return;
  }

  const text = buildInsertText(editor.document, picked.file);
  await recentFiles.remember(picked.file);
  await editor.edit((editBuilder) => {
    for (const selection of editor.selections) {
      editBuilder.replace(selection, text);
    }
  });
}

function showRankedFileQuickPick(files, recentFiles, limit) {
  return new Promise((resolve) => {
    const quickPick = vscode.window.createQuickPick();
    let settled = false;

    quickPick.placeholder = 'Search workspace file';
    quickPick.matchOnDescription = true;
    quickPick.sortByLabel = false;

    const finish = (picked) => {
      if (settled) {
        return;
      }

      settled = true;
      for (const disposable of disposables) {
        disposable.dispose();
      }
      quickPick.dispose();
      resolve(picked);
    };

    const updateItems = () => {
      quickPick.items = rankFiles(files, quickPick.value, limit, recentFiles)
        .map((matched) => ({
          label: matched.file.name,
          description: matched.file.workspacePath,
          file: matched.file
        }));
    };

    const disposables = [
      quickPick.onDidChangeValue(updateItems),
      quickPick.onDidAccept(() => {
        finish(quickPick.selectedItems[0]);
      }),
      quickPick.onDidHide(() => {
        finish(undefined);
      })
    ];

    updateItems();
    quickPick.show();
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

function rankFiles(files, query, limit, recentFiles) {
  const normalizedQuery = normalizeQuery(query);
  const ranked = [];

  for (const file of files) {
    const score = scoreFile(file, normalizedQuery, recentFiles);
    if (score === undefined) {
      continue;
    }
    ranked.push({ file, score });
  }

  return ranked
    .sort(compareRankedFiles)
    .slice(0, limit);
}

function scoreFile(file, query, recentFiles) {
  const recentRank = getRecentRank(recentFiles, file);
  const recentScore = recentRank === Number.POSITIVE_INFINITY
    ? 0
    : MAX_RECENT_FILES - Math.min(recentRank, MAX_RECENT_FILES - 1);

  if (!query) {
    return {
      exactness: EXACTNESS.NONE,
      kind: MATCH_KIND.EMPTY,
      quality: 0,
      index: 0,
      length: file.workspacePath.length,
      recentScore,
      recentRank
    };
  }

  const candidates = buildMatchCandidates(file, query);

  if (candidates.length === 0) {
    return undefined;
  }

  const best = candidates.sort(compareMatchScores)[0];
  return {
    ...best,
    recentScore,
    recentRank
  };
}

function compareRankedFiles(a, b) {
  return compareScores(a.score, b.score)
    || a.file.workspacePath.localeCompare(b.file.workspacePath);
}

function compareScores(a, b) {
  return b.exactness - a.exactness
    || (b.recentScore || 0) - (a.recentScore || 0)
    || b.kind - a.kind
    || b.quality - a.quality
    || a.index - b.index
    || a.length - b.length;
}

function compareMatchScores(a, b) {
  return compareScores(a, b);
}

function buildMatchCandidates(file, query) {
  const candidates = [];
  const normalizedName = normalize(file.name);
  const normalizedPath = normalize(file.workspacePath);

  addTextMatchCandidates(candidates, stripExtension(normalizedName), query, 40);
  addTextMatchCandidates(candidates, normalizedName, query, 35);
  addTextMatchCandidates(candidates, stripExtension(normalizedPath), query, 20);
  addTextMatchCandidates(candidates, normalizedPath, query, 15);
  addWordMatchCandidates(candidates, file.name, query, 45);
  addWordMatchCandidates(candidates, file.workspacePath, query, 25);

  return candidates;
}

function addTextMatchCandidates(candidates, value, query, targetQuality) {
  if (!value) {
    return;
  }

  if (value === query) {
    candidates.push({
      exactness: EXACTNESS.TARGET,
      kind: MATCH_KIND.EXACT,
      quality: targetQuality,
      index: 0,
      length: value.length
    });
    return;
  }

  if (value.startsWith(query)) {
    candidates.push({
      exactness: EXACTNESS.NONE,
      kind: MATCH_KIND.PREFIX,
      quality: targetQuality,
      index: 0,
      length: value.length
    });
  }

  const index = value.indexOf(query);
  if (index > 0) {
    candidates.push({
      exactness: EXACTNESS.NONE,
      kind: MATCH_KIND.SUBSTRING,
      quality: targetQuality,
      index,
      length: value.length
    });
  }

  const fuzzy = fuzzyScore(value, query);
  if (fuzzy !== undefined) {
    candidates.push({
      exactness: EXACTNESS.NONE,
      kind: MATCH_KIND.FUZZY,
      quality: targetQuality + fuzzy.score,
      index: fuzzy.firstIndex,
      length: value.length
    });
  }
}

function addWordMatchCandidates(candidates, value, query, targetQuality) {
  const words = splitSearchWords(value);

  for (const [wordIndex, word] of words.entries()) {
    if (word === query) {
      candidates.push({
        exactness: EXACTNESS.WORD,
        kind: MATCH_KIND.EXACT,
        quality: targetQuality,
        index: wordIndex,
        length: word.length
      });
    } else if (word.startsWith(query)) {
      candidates.push({
        exactness: EXACTNESS.NONE,
        kind: MATCH_KIND.WORD_PREFIX,
        quality: targetQuality,
        index: wordIndex,
        length: word.length
      });
    }
  }
}

function fuzzyScore(value, query) {
  let searchFrom = 0;
  let gapPenalty = 0;
  let firstIndex = -1;

  for (const char of query) {
    const index = value.indexOf(char, searchFrom);
    if (index < 0) {
      return undefined;
    }

    if (firstIndex < 0) {
      firstIndex = index;
    }
    gapPenalty += index - searchFrom;
    searchFrom = index + 1;
  }

  return {
    score: query.length * 10 - gapPenalty - value.length,
    firstIndex
  };
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

function normalizeRecentPaths(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => typeof item === 'string' && item.length > 0)
    .slice(0, MAX_RECENT_FILES);
}

function getRecentKey(file) {
  if (typeof file === 'string') {
    return file;
  }
  return file && typeof file.workspacePath === 'string' ? file.workspacePath : undefined;
}

function getRecentRank(recentFiles, file) {
  if (!recentFiles || typeof recentFiles.getRank !== 'function') {
    return Number.POSITIVE_INFINITY;
  }
  return recentFiles.getRank(file);
}

function needsFolderPrefix() {
  return Array.isArray(vscode.workspace.workspaceFolders) && vscode.workspace.workspaceFolders.length > 1;
}

function normalizeQuery(value) {
  return normalize(String(value || '').trim());
}

function normalize(value) {
  return String(value).toLowerCase();
}

function stripExtension(value) {
  const extension = path.extname(value);
  return extension ? value.slice(0, -extension.length) : value;
}

function splitSearchWords(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

module.exports = {
  activate,
  deactivate,
  __test: {
    RecentFilesStore,
    rankFiles,
    scoreFile,
    splitSearchWords
  }
};
