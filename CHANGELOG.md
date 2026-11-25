# Changelog

All notable changes to ZFileTimeMachine are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [0.3.0] — 2026-11-25

A redesign of the whole app. Every screen, dialog and menu is new, the folder view is built around a file's history instead of a list, and a few things that were only possible through the config before now have controls. How files are watched and stored is unchanged, so your existing history carries over as it is.

### Added

- **A new icon**, in the app, the taskbar, the installers and on the website. The macOS menu bar gets its own single-color version that follows the light or dark bar.
- **Sidebar with your folders.** Every watched folder is one click away, with a dot while it's watched and a pause sign when it isn't. The storage meter, Settings and About sit at the bottom. `Ctrl B` / `⌘ B` collapses it, and it narrows by itself in small windows.
- **Overview.** The folder cards show versions, files and two weeks of activity, and below them the most recent changes across all folders, each linking straight to that file's history.
- **A new folder view.** A file tree on the left, the selected file's history on the right.
  - The tree folds and filters, is moved through with the arrow keys, and stays smooth with thousands of files. Right-click a subfolder to pause or resume it.
  - Versions are grouped by day. Each one shows how many lines it added and removed compared with the version before it, and small icons mark versions saved by hand, on a schedule, or kept before a restore.
  - The comparison with the file as it is now sits beside the list. Long unchanged stretches are folded so the changes come first, and can be opened with one click. `Ctrl F` searches it.
  - **Restore this version** opens a short confirmation with the line counts and the "keep the current file first" switch. After restoring, the **Current** marker travels down the history to the restored version.
- **Choose what to watch, file by file.** Adding a folder, in the welcome guide or later, shows its contents as a tree with sizes. Untick any folder or file you don't want versions of, or tick a single file inside a folder you skipped. The same tree is in the folder's settings under **What to watch**, with the full rule list below it.
- **Themes.** Seven themes (Graphite, Midnight, Obsidian, Slate, Forest, Mocha, Plum), each for dark and light, plus a mode that follows your system. Pick one of ten accent colors or any color of your own, and choose how round the corners are, from sharp to round. Text on colored buttons turns dark or light by itself, so it stays readable.
- **Folder icon colors.** A folder's icon follows the accent color unless you give the folder its own: one of nine colors or any color you pick. A switch in Settings under Appearance makes every folder use the accent color. In light mode the colors are darker, so icons are easier to see. The Code preset uses the accent color instead of a fixed blue.
- **Always show the whole file** (off by default). Shows every line of a version, also when nothing changed, instead of only the changes. Switch it next to a comparison or in Settings under Appearance.
- **Click a path to copy it.** Folder and file paths in the headers copy with one click. Before, they were part of the window's drag area and couldn't be selected.
- **Image previews.** For pictures (PNG, JPEG, GIF, WebP, AVIF, BMP, ICO, SVG) a version is shown next to the file as it is now.
- **Search finds files.** `Ctrl K` / `⌘ K` now searches the files of every watched folder too, and opens the match in its folder.
- **When versions are saved** can be chosen per folder: every save, every save plus a check on a schedule, or only by hand.
- **How long versions are kept** can be a number of versions, a number of days, or both. Before, only the number of versions could be changed.
- **Unsaved changes bar** in Settings, with Revert and Save (`Ctrl S` / `⌘ S`).
- **Native window material.** The sidebar is translucent on macOS and uses Mica on Windows 11. Windows 10 and Linux keep a solid window.
- Dropping a folder on the window works from every screen, not only the folder list, and lets you choose what to watch first.
- Switching between dark and light spreads out from where you clicked.

### Changed

- **Closing the window keeps the app running in the tray by default**, so folders stay protected. Settings has a clear choice between that and quitting. If you saved your settings in an earlier version, your choice is kept.
- Starting the app while it's already running brings its window back instead of starting a second copy. Two copies would both have watched the same folders.
- The app says "version" and "restore" instead of "snapshot" and "rewind".
- Dialogs open and close with a soft scale and blur, menus grow from the cursor, notifications slide up from the bottom, and highlights glide between items. With reduced motion turned on in your system, all of that is skipped.
- Settings are grouped into short lists with a section list on the left. **Storage** in the sidebar opens the storage settings directly.
- Making a folder keep fewer versions now asks in the app's own dialog instead of a browser popup, and also covers a shorter number of days.
- The Recover screen keeps all its options, laid out as "Where the files go" and "Which version", and its preview, confirmation and conflict dialogs are rebuilt.
- The welcome guide is one window whose content slides between steps. It adds the folder only after you chose what to watch. Before, the first scan had already saved everything by the time it asked what to skip.
- Notifications about deleted and renamed files only appear while that folder is open.
- Folders set to the "Interval" mode are labelled "Saves and every N min". In this mode the app has always also saved on every change, and the old label suggested it didn't.

### Fixed

- **The keyboard shortcut list** named shortcuts that never existed (`Space` and `Shift + Click` in the recovery tree). The list in the app and in the README now matches what works.
- **The Recover tree changed its own state while drawing** when you typed in its filter, which made React render it twice. It now updates after drawing.

### Under the hood

- New commands for the per-version line counts and the window material, and a `zftm-snapshot` protocol that streams a version's image to the preview without going through the JavaScript bridge. Images over 40 MB aren't previewed.
- A new command lists a folder's contents for the tree. It can't leave the folder and stops adding up sizes in very large ones.
- GSAP is a new frontend dependency, and Tauri's single-instance plugin a new backend one.
- Tests for the line counts, the image protocol and the folder listing.

## [0.2.1] — 2026-11-25

A fix release for [#2](https://github.com/TheHolyOneZ/ZFileTimeMachine/issues/2). Watching a folder that contains ZFileTimeMachine's own data folder (for example `~/Library/Application Support` on macOS) made the app snapshot its own snapshots, endlessly. Looking into it turned up two more bugs, in ignore rules and in pausing subfolders.

### Fixed

- **The app no longer snapshots its own data** ([#2](https://github.com/TheHolyOneZ/ZFileTimeMachine/issues/2)).
  Every snapshot writes to the content store (`cas/`) and the database. When that folder was inside a watched folder, each of those writes was picked up as a change and snapshotted again, so new files kept appearing without end.
  - ZFileTimeMachine's own data folder is now always skipped, in live watching, scheduled scans, the first scan and recovery, without any ignore rule. This also covers the folders the app's window keeps its cache and settings in.
  - Files from the app's data folder that earlier versions already tracked are removed from the list on the next start, together with their snapshots. Space that only those snapshots used is freed; content that is also part of your real files is kept. The folder's activity feed shows an "App data skipped" entry with the number of files.
  - Adding the app's data folder itself as a watched folder is refused with an explanation.
- **Folder ignore rules didn't work on live changes.** A rule for a folder, such as `Cache/`, `node_modules/` or `com.example.App/cas/`, was only checked against the changed file's own name, never against the folders it sits in. So the first scan skipped those folders, but every later change inside them was still snapshotted. This also affected the built-in `node_modules/`, `target/` and `.git/` rules. Rules are now checked against every parent folder, the same way the first scan applies them. Ignore patterns on the Recover screen had the same bug and are fixed too.
- **A paused subfolder resumed by itself.** Pausing auto-snapshots for a subfolder only switched the files already in it to manual-only. Any file created there afterwards was snapshotted normally, and the folder no longer showed as paused. The pause is now stored for the folder itself: new files in it are added as paused, without a snapshot, and can still be snapshotted by hand. Resuming one subfolder inside a paused folder works as well. Subfolders paused with an earlier version need to be paused once more for new files to follow.
- **Pausing a subfolder also paused folders with similar names.** The match treated `_` and `%` as wildcards and ignored upper and lower case, so pausing `my_dir` also paused `myXdir` and `My_dir`. It now only matches the exact folder.
- **A paused file that was deleted and created again stayed hidden** from the list. It now shows up again.
- **Skipped changes left unused data behind.** A change that wasn't snapshotted (manual-only file, minimum snapshot interval) still had its content written to the store, where nothing pointed to it. Content is now only written when a snapshot is actually created.
- **Garbage collection could delete content that was just being saved.** Writing to the store and recording the snapshot happened in two separate steps, and a collection run in between could remove the new content. Both now happen in one step.

### Changed

- The ignore rules editor explains that a rule ending in `/` skips a folder and everything in it, and that the app's own data folder never needs a rule.
- The subfolder pause popup says that files added later are paused too.
- Regression tests for all of the above, including a live file-watcher test with the content store inside the watched folder.

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

[0.2.1]: https://github.com/TheHolyOneZ/ZFileTimeMachine/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/TheHolyOneZ/ZFileTimeMachine/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/TheHolyOneZ/ZFileTimeMachine/releases/tag/v0.1.0
