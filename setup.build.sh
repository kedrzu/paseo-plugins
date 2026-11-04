#!/usr/bin/env bash
# Everything needed to compile and test the repo, and nothing else: dependencies, the nzyme CLI,
# generated code (per-package tsconfigs, `.loc.ts` translations), TypeScript, the test browser.
#
# Called by setup.sh and run by CI as its build step, so what CI proves is exactly what a local build
# does. Anything needing local infrastructure (a database, secrets) belongs in setup.sh, never here.
#
# bash rather than zsh: the GitHub-hosted runners have bash, and nothing here needs zsh.
set -e

step() {
    echo ""
    echo "$1"
    echo ""
}

step "📦 Installing dependencies..."
if [ "$CI" = "true" ]; then
    bun install --frozen-lockfile
else
    bun install
fi

# The CLI generates the per-package tsconfigs and translations everything else compiles against, so
# it has to exist before any of that runs.
step "🔨 Building nzyme cli..."
bun nx run @nzyme/cli:build

step "🛠️ Generating tsconfigs and translations..."
bun run monorepo
bun run localise

step "📝 Building typescript..."
bun x tsgo --build


