# Changelog

All notable changes to ZFileTimeMachine are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [0.2.0] — 2026-10-14

A reliability and design release. It fixes files vanishing from the list after a restore, a handful of related history bugs, and gives the whole app a new look with its own title bar.

### Fixed

- **Restored files no longer disappear from the file list** ([#1](https://github.com/TheHolyOneZ/ZFileTimeMachine/issues/1)).
  Restoring writes a temporary file and renames it over the original. Windows reports that as the original being *removed*, and the watcher marked the file as deleted. Once hidden, a file never came back, even when it was saved again.
  - A "removed" event now only counts as a deletion if the file is really gone from disk.
  - Saving, rewinding, or restoring a file that was hidden by mistake brings it back.
  - Files that earlier versions hid by mistake reappear on the next app start (the startup scan picks them up) or the next time they change.
- **Restoring a deleted file from the Recover screen** now puts it back in the list.
- **Copies were treated as renames.** Creating a file with the same content as another one moved the original's history onto the copy. Renames are now only detected when the old file is actually gone.
- **"Current" pointed at the wrong snapshot after a rewind.** The timeline now marks the version that matches what is on disk instead of simply the newest snapshot.
- **A failed rewind showed no error.** It now reports the failure, and confirms when a rewind succeeds.
- **Folder names on Windows** were taken from the full path when adding a folder (forward slashes only).
- **The Rewind dialog was cut off** with its confirm button hidden below the window. All dialogs now render above the whole app.
- **"No files tracked yet" showed twice** for empty folders, and wrongly appeared inside folders that only contain subfolders.
- **Many colors silently didn't render.** Around 100 style classes used opacity steps Tailwind doesn't generate (for example the command palette background), which left some surfaces see-through.
- **The settings sidebar had no fixed width** because it used a class that doesn't exist.
- **Light theme:** status colors (paused, added/removed, badges) and borders were nearly invisible on white.
- The app's own temporary files (`.zftm_tmp_*`) are ignored by the watcher.

### Added

- **Custom title bar** with the app name, a search box for folders and commands (`Ctrl K` / `⌘ K`), and window controls.
  - **Windows and Linux:** custom minimize, maximize/restore, and close buttons. Drag to move, double-click to maximize, and resize from the edges.
  - **Windows 11:** rounded corners and a native shadow. Windows 10 keeps square corners, which avoids the white border it would otherwise draw.
  - **macOS:** keeps the native traffic-light buttons, placed inside the new title bar.
- **In-app confirmation dialog** for removing a folder (replaces the browser's popup).
- The **About** page reads the version from the app, so it can no longer go out of date.
- Regression tests for issue #1, including a replay of the exact Windows event sequence and a live file-watcher test.

### Changed

- **New look.** The app uses Geist and Geist Mono (bundled, works offline). The title bar and navigation rail share one frame, and content sits on a raised panel. Cards, dialogs, and menus have soft depth and consistent styling, in both dark and light themes.
- **Navigation is unchanged.** Same rail, same items, same tabs, all in the same places.
- Dashboard: the stat tiles and "Snapshot Engine Running" card are replaced by a single status line. Folder cards show readable details such as "Keeps last 10 · Added 3 days ago".
- Timeline: aligned columns, right-aligned numbers, times that no longer get cut off, and quieter source labels.
- Activity feed: plain-language entries ("9 files checked · 2 new or changed" instead of `total=9 new_or_changed=2`).
- Clearer wording in onboarding and on the Recover screen. Sentence case throughout.
- Much higher text contrast across the app. Decorative glows and gradients are removed.
- Respects the system "reduce motion" setting.

## [0.1.0] — 2026-06-11

First public release.

- Automatic per-file snapshots for any folder (on change, interval, manual, or hybrid)
- File timeline with line-by-line diffs and one-click rewind, with an automatic pre-rewind backup
- Bulk recovery: export or restore many files at once, at the latest version, N versions back, or any point in time
- Notes on files and snapshots with full-text search
- Retention rules, binary-file limits, optional zstd compression, and a deduplicated content store
- Pause/resume, soft-delete with undo, ignore rules, per-file manual-only mode
- Storage stats, integrity check, and garbage collection
- Builds for Linux, Windows, and macOS

[0.2.0]: https://github.com/TheHolyOneZ/ZFileTimeMachine/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/TheHolyOneZ/ZFileTimeMachine/releases/tag/v0.1.0
