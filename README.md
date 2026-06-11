# Markdown @ File Link

Type `@` in a Markdown file, search workspace files, and insert a clickable relative Markdown link.

This extension is intentionally small: it only activates for Markdown files, has no runtime dependencies, and does not send any workspace data outside VS Code.

[中文说明](README.zh-CN.md)

## Features

- `@` file completions in Markdown documents.
- Fuzzy search by file name or workspace-relative path.
- Inserts links relative to the current Markdown file.
- Handles filenames with spaces by using Markdown angle-bracket link targets.
- Command Palette fallback: `Markdown @ File Link: Insert Workspace File Link`.
- Works in VS Code-compatible editors such as Cursor when installed in that editor's extension directory.

## Usage

Open a Markdown file and type:

```md
@
```

Continue typing a file name or path, then select a suggestion.

For example, when editing `docs/demo.md`, selecting `server/main/main.go` inserts:

```md
[server/main/main.go](../server/main/main.go)
```

If the completion list does not open automatically, run `Trigger Suggest`:

- macOS: `Ctrl+Space` or the keybinding configured in your editor.
- Windows/Linux: `Ctrl+Space`.

You can also run this command from the Command Palette:

```text
Markdown @ File Link: Insert Workspace File Link
```

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `markdownAtFileLink.maxFiles` | `20000` | Maximum workspace files to index. |
| `markdownAtFileLink.maxSuggestions` | `200` | Maximum completion items shown after `@`. |
| `markdownAtFileLink.exclude` | See `package.json` | Glob patterns excluded from the file index. |
| `markdownAtFileLink.linkText` | `relativePath` | Link label style: `relativePath` or `fileName`. |
| `markdownAtFileLink.insertStyle` | `markdownLink` | Insert style: `markdownLink` or `plainPath`. |

Example:

```json
{
  "markdownAtFileLink.linkText": "fileName",
  "markdownAtFileLink.maxSuggestions": 100
}
```

## Local Development

Install dependencies:

```bash
npm install
```

Run a syntax check:

```bash
npm run lint
```

Open this repository in VS Code, press `F5`, and test the extension in the Extension Development Host.

To install the extension from source into local VS Code and Cursor extension directories:

```bash
./install.sh
```

Then run `Developer: Reload Window`.

## Package

Create a `.vsix` package:

```bash
npm run package
```

## Publish to Visual Studio Marketplace

Publishing uses the official `@vscode/vsce` tool.

1. Create or verify the Marketplace publisher named `jarvanstack`.
2. Create a Personal Access Token with Marketplace publishing permission.
3. Login:

```bash
npx vsce login jarvanstack
```

4. Publish:

```bash
npm run publish
```

Official docs:

- https://code.visualstudio.com/api/working-with-extensions/publishing-extension

## License

MIT
