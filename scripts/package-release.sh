#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
version="${GITHUB_REF_NAME:-v$(node -p "require('${repo_root}/package.json').version")}"
output_dir="${repo_root}/dist"
output_file="${output_dir}/qipai-${version}.zip"

mkdir -p "${output_dir}"
rm -f "${output_file}"
cd "${repo_root}"
zip -qr "${output_file}" qipai \
  -x "*/.DS_Store" "*/node_modules/*" "*/test-results/*"
printf '%s\n' "${output_file}"
