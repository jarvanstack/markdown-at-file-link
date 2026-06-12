---
name: "vscode-marketplace-manual-upload"
description: "Fast path for updating a VS Code extension on Visual Studio Marketplace by packaging a VSIX and manually uploading it in the logged-in Chrome Marketplace UI, especially when VSCE_PAT/GitHub Actions are unavailable or intentionally disabled."
---

# VS Code Marketplace Manual Upload

Use this when the user wants to update/publish a VS Code extension and the fastest reliable path is the Marketplace web UI.

## Fast Workflow

1. Confirm the extension id from `package.json`:
   - publisher: `publisher`
   - extension name: `name`
   - marketplace id: `<publisher>.<name>`
2. Check the latest published version:
   ```bash
   npx vsce show <publisher>.<name> --json
   ```
3. If publishing a new version, bump `package.json` and lockfile:
   ```bash
   npm version <next-version> --no-git-tag-version
   ```
4. Run validation:
   ```bash
   npm test
   ```
   If the repo has no `test`, run `npm run lint` or the repo's closest prepublish check.
5. Package:
   ```bash
   npm run package
   ```
6. Verify the VSIX before upload:
   ```bash
   unzip -p <extension>-<version>.vsix extension/package.json
   unzip -l <extension>-<version>.vsix
   ```
7. Use the Chrome skill with the user's logged-in browser:
   - Open `https://marketplace.visualstudio.com/manage/publishers/<publisher>`
   - Click `New extension` -> `Visual Studio Code`
   - Upload the local `.vsix`
   - Click `Upload`
8. Wait until the publisher list changes from `Verifying <version>` to `<version>`.
9. Verify publicly:
   ```bash
   npx vsce show <publisher>.<name> --json
   ```
10. Commit and push any version/package/source changes.

## Pitfalls

- Do not start by chasing `VSCE_PAT` or Azure DevOps organization setup. If PAT is missing, manual Marketplace upload is faster.
- If Azure DevOps asks for an Azure subscription while creating an organization, stop. That is not needed for this workflow.
- If the user explicitly asked to publish/update, uploading the VSIX is authorized; still stop if the selected file/version does not match the intended release.
- Keep any Marketplace management tab open at the end if it shows useful publish status.
