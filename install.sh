#!/usr/bin/env bash
set -euo pipefail

extension_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
extension_name="$(
  node -e "const p=require(process.argv[1]); process.stdout.write(\`\${p.publisher}.\${p.name}-\${p.version}\`)" \
    "${extension_dir}/package.json"
)"

install_to() {
  local extensions_root="$1"
  local app_name="$2"
  local target_dir="${extensions_root}/${extension_name}"

  mkdir -p "${extensions_root}"

  if [[ -e "${target_dir}" && ! -L "${target_dir}" ]]; then
    echo "Install target exists and is not a symlink: ${target_dir}" >&2
    echo "Remove it manually or install under a different extension id." >&2
    exit 1
  fi

  ln -sfn "${extension_dir}" "${target_dir}"

  echo "Installed for ${app_name}:"
  echo "  ${target_dir} -> ${extension_dir}"
}

install_to "${HOME}/.vscode/extensions" "VSCode"
install_to "${HOME}/.cursor/extensions" "Cursor"

echo "Reload VSCode/Cursor window to activate it."
