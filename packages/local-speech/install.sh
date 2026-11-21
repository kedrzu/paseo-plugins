#!/bin/zsh
# Installs local-speech as a launchd agent that starts at login and restarts if it dies.
# Re-run after moving the checkout or changing settings. `install.sh --uninstall` removes it.
set -euo pipefail

LABEL="com.paseo-plugins.local-speech"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/local-speech.log"
DIR="${0:A:h}"
UV="$(command -v uv)"

launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true

if [[ "${1:-}" == "--uninstall" ]]; then
    rm -f "$PLIST"
    echo "Removed $LABEL."
    exit 0
fi

"$UV" sync --project "$DIR" --frozen --quiet

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>$UV</string><string>run</string><string>--project</string><string>$DIR</string>
        <string>--frozen</string><string>python</string><string>$DIR/server.py</string>
    </array>
    <key>WorkingDirectory</key><string>$DIR</string>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>ProcessType</key><string>Interactive</string>
    <key>StandardOutPath</key><string>$LOG</string>
    <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST

launchctl bootstrap "gui/$UID" "$PLIST"
echo "Installed $LABEL from $DIR; log: $LOG"
