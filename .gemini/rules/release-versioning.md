# Release Versioning Rules

Whenever creating or updating a release:
1. **Never reuse or overwrite an existing release version (e.g. `v1.0`) repeatedly.**
2. **Increment version numbers semantically** based on changes:
   - Patch (`v1.1.1`): Bug fixes, minor visual adjustments.
   - Minor (`v1.2.0`): New features, new key combinations, UI overhaul.
   - Major (`v2.0.0`): Breaking changes, major rewrites.
3. **Keep versions synchronized across all files**:
   - `package.json` (`version`)
   - `android/app/build.gradle` (`versionCode` incremented by 1, `versionName` updated to match semver)
   - APK filename: `ADBKeyboard-v<version>.apk` (e.g., `ADBKeyboard-v1.1.0.apk`)
   - Git tag and GitHub Release: `v<version>` (e.g., `v1.1.0`)
4. **Attach both the APK and `ADBKeyboardCompanion.exe`** to new GitHub releases.
