# Markdown @ File Link

在 Markdown 文件里输入 `@`，搜索当前工作区文件，并插入可点击的相对 Markdown 链接。

这个扩展刻意保持轻量：只在 Markdown 文件中激活，没有运行时依赖，也不会把工作区数据发送到 VS Code 外部。

## 功能

- 在 Markdown 文档里提供 `@` 文件补全。
- 支持按文件名或工作区相对路径模糊搜索。
- 按当前 Markdown 文件位置插入相对链接。
- 文件名包含空格时，会使用 Markdown angle-bracket link target。
- 提供命令面板兜底命令：`Markdown @ File Link: Insert Workspace File Link`。
- 安装到对应扩展目录后，也可在 Cursor 等 VS Code 兼容编辑器中使用。

## 使用

打开 Markdown 文件，输入：

```md
@
```

继续输入文件名或路径，然后选择候选项。

例如编辑 `docs/demo.md` 时，选择 `server/main/main.go` 会插入：

```md
[server/main/main.go](../server/main/main.go)
```

如果补全列表没有自动弹出，可以手动触发补全：

- macOS：`Ctrl+Space`，或你编辑器里配置的补全快捷键。
- Windows/Linux：`Ctrl+Space`。

也可以从命令面板运行：

```text
Markdown @ File Link: Insert Workspace File Link
```

## 配置

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `markdownAtFileLink.maxFiles` | `20000` | 最多索引的工作区文件数。 |
| `markdownAtFileLink.maxSuggestions` | `200` | 输入 `@` 后最多展示的候选数量。 |
| `markdownAtFileLink.exclude` | 见 `package.json` | 从索引中排除的 glob 规则。 |
| `markdownAtFileLink.linkText` | `relativePath` | 链接文字：`relativePath` 或 `fileName`。 |
| `markdownAtFileLink.insertStyle` | `markdownLink` | 插入形式：`markdownLink` 或 `plainPath`。 |

配置示例：

```json
{
  "markdownAtFileLink.linkText": "fileName",
  "markdownAtFileLink.maxSuggestions": 100
}
```

## 本地开发

安装依赖：

```bash
npm install
```

执行语法检查：

```bash
npm run lint
```

用 VS Code 打开本仓库，按 `F5` 启动 Extension Development Host 测试扩展。

如果要把源码版本安装到本机 VS Code 和 Cursor 的扩展目录：

```bash
./install.sh
```

然后运行 `Developer: Reload Window`。

## 打包

生成 `.vsix`：

```bash
npm run package
```

## 发布到 Visual Studio Marketplace

发布使用官方 `@vscode/vsce` 工具。

1. 创建或确认 Marketplace publisher 名称为 `jarvanstack`。
2. 创建具备 Marketplace 发布权限的 Personal Access Token。
3. 登录：

```bash
npx vsce login jarvanstack
```

4. 发布：

```bash
npm run publish
```

官方文档：

- https://code.visualstudio.com/api/working-with-extensions/publishing-extension

## 许可证

MIT
