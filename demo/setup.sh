#!/bin/zsh
# Builds the throwaway repo the demo runs in.
set -e
REPO_ROOT="${1:?usage: setup.sh <repo-root> <target-dir>}"
D="${2:?}"
rm -rf "$D"; mkdir -p "$D/src/auth" "$D/src/api"
cd "$D"
cat > scopecreep.json <<'JSON'
{
  "scope": ["src/auth/**"],
  "protected": ["package.json", ".env*"],
  "mode": "warn"
}
JSON
echo 'export function listUsers() {}' > src/api/users.ts
echo '{ "name": "app", "dependencies": {} }' > package.json
echo 'export const login = () => {}' > src/auth/login.ts
