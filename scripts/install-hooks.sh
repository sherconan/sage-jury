#!/usr/bin/env bash
# Install repo-local git hooks (gitleaks-based pre-commit secret guard).
# Run once after cloning:  ./scripts/install-hooks.sh
set -e

ROOT="$(git rev-parse --show-toplevel)"
HOOK="$ROOT/.git/hooks/pre-commit"

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "Installing gitleaks via Homebrew..." >&2
  brew install gitleaks
fi

cat > "$HOOK" <<'HOOK'
#!/usr/bin/env bash
set -e
if ! command -v gitleaks >/dev/null 2>&1; then
  echo "[pre-commit] gitleaks not on PATH — run: brew install gitleaks" >&2
  exit 1
fi
REPO_ROOT="$(git rev-parse --show-toplevel)"
CONFIG="$REPO_ROOT/.gitleaks.toml"
if [ -f "$CONFIG" ]; then
  gitleaks protect --staged --redact --no-banner --verbose --config "$CONFIG"
else
  gitleaks protect --staged --redact --no-banner --verbose
fi
HOOK

chmod +x "$HOOK"
echo "pre-commit hook installed at $HOOK"
echo "Test it:  echo 'sk-$(openssl rand -hex 16)' > /tmp/x && git add /tmp/x && git commit -m test"
