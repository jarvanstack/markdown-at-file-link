const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const Module = require('node:module');

const originalLoad = Module._load;

Module._load = function load(request, parent, isMain) {
  if (request === 'vscode') {
    return {
      CompletionItem: class CompletionItem {},
      CompletionItemKind: { File: 17 },
      CompletionList: class CompletionList {},
      MarkdownString: class MarkdownString {},
      Range: class Range {},
      commands: { registerCommand() {} },
      languages: { registerCompletionItemProvider() {} },
      window: {},
      workspace: {
        getConfiguration() {
          return {
            get(_key, fallback) {
              return fallback;
            }
          };
        }
      }
    };
  }

  return originalLoad.call(this, request, parent, isMain);
};

const { __test } = require('../extension');
Module._load = originalLoad;

const { rankFiles, splitSearchWords } = __test;

function file(workspacePath) {
  return {
    name: path.posix.basename(workspacePath),
    workspacePath
  };
}

function recent(...workspacePaths) {
  return {
    getRank(candidate) {
      const key = typeof candidate === 'string' ? candidate : candidate.workspacePath;
      const index = workspacePaths.indexOf(key);
      return index < 0 ? Number.POSITIVE_INFINITY : index;
    }
  };
}

function rankedPaths(workspacePaths, query, recentFiles) {
  return rankFiles(workspacePaths.map(file), query, 20, recentFiles)
    .map((match) => match.file.workspacePath);
}

test('exact file stem match outranks a recent weaker match', () => {
  const paths = rankedPaths(
    [
      'src/set-old-things.md',
      'docs/settings.md'
    ],
    'settings',
    recent('src/set-old-things.md')
  );

  assert.equal(paths[0], 'docs/settings.md');
});

test('exact word match outranks a recent character-split match', () => {
  const paths = rankedPaths(
    [
      'src/a-p-i-notes.md',
      'src/api/client.md'
    ],
    'api',
    recent('src/a-p-i-notes.md')
  );

  assert.equal(paths[0], 'src/api/client.md');
});

test('recent files are preferred among ordinary prefix matches', () => {
  const paths = rankedPaths(
    [
      'src/readme.md',
      'docs/readme.md'
    ],
    'read',
    recent('docs/readme.md')
  );

  assert.equal(paths[0], 'docs/readme.md');
});

test('recent files are preferred before character-split match quality', () => {
  const paths = rankedPaths(
    [
      'src/a-b-c-note.md',
      'src/alpha-beta-client.md'
    ],
    'abc',
    recent('src/alpha-beta-client.md')
  );

  assert.equal(paths[0], 'src/alpha-beta-client.md');
});

test('whole word matches outrank substring-only matches', () => {
  const paths = rankedPaths(
    [
      'src/profile.md',
      'src/use-file-link.md'
    ],
    'file'
  );

  assert.equal(paths[0], 'src/use-file-link.md');
});

test('empty query shows recent files first', () => {
  const paths = rankedPaths(
    [
      'src/alpha.md',
      'src/beta.md'
    ],
    '',
    recent('src/beta.md')
  );

  assert.equal(paths[0], 'src/beta.md');
});

test('word splitting understands separators and camel case', () => {
  assert.deepEqual(splitSearchWords('src/useFileLink.ts'), ['src', 'use', 'file', 'link', 'ts']);
});
