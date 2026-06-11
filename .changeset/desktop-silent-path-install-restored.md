---
"@inkeep/open-knowledge": patch
---

Open Knowledge Desktop again puts the `ok` command on your PATH automatically — politely. Launching the packaged app installs silent terminal shims (`~/.ok/bin/ok` and `~/.ok/bin/open-knowledge` symlinks into the app bundle, a `~/.ok/env.sh` PATH shim, and a clearly marked managed block in your shell rc files — `.zshrc`, plus `.bash_profile` and fish config where present) with no admin prompt. Any user who has run Desktop at least once can type `ok` in a new terminal.

Good-manners guarantees: the edit is disclosed in-app via a sticky toast that names the exact file(s) touched; the block is padded with blank lines and carries an inline opt-out hint; and deleting the block from an rc file is honored permanently — Open Knowledge records the opt-out and never re-adds it to that file. The `~/.ok/bin` shims themselves still self-heal on every startup, and `OK_RECLAIM_DISABLE=1` disables the whole mechanism.

Unlike the earlier incarnation of this feature, Desktop no longer seeds `ok` symlinks into other writable PATH directories (`~/.cargo/bin`, `~/.local/bin`, and the like) to make the command visible in already-open shells — that surprised users more than it helped. Startup now cleans up the symlinks earlier builds recorded, removing each one only while it still points at the recorded bundle target; anything re-pointed or foreign is left alone. The `/usr/local/bin` admin-prompt installer remains retired.
