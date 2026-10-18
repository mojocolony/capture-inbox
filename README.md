# Capture Inbox — v0.1

A standalone, responsive daily-review web app for the existing **Capture** Apple Shortcut. It reads text captures and their matching screenshots from Dropbox, and lets you **Act**, **Keep**, **Dismiss**, or return an item to **Inbox**. You can search, inspect the original image, open original source links, and save private review notes.

**This build includes the full app, but it has not yet been connected to your Dropbox account or deployed to GitHub Pages.** You can open the built-in demo without Dropbox. The real Dropbox connection requires you to create an OAuth app and approve its permissions.

## What this does / does not do

- Does: read `.txt` and `.png` pairs from Dropbox, matched using the Capture Shortcut's timestamp-based names.
- Does: extract `SOURCE`, `SOURCE DETAILS`, `CAPTURED`, and `CONTENT` from the TXT record.
- Does: show the original PNG and open a supported `https://`, `http://`, or `readdle-spark://` link contained in source details.
- Does: save **review status and notes separately** in `_capture_inbox_state.json` in the same Dropbox folder. Original TXT/PNG content is never modified.
- Does: make review decisions available across devices signed into the same Dropbox account; Dropbox writes use revision checking and retry if another device updated the state file.
- Does not: edit the working Capture Shortcut, create reminders, modify groceries, or read email directly.
- Does not: perform arbitrary full-text indexing across all of Dropbox; v0.1 searches the text of captures loaded into the interface (200 at a time).
- Does not: provide automated continuous background Dropbox polling; use the ↻ refresh button for new captures.

## Privacy and Dropbox permissions

This is a **client-only** application. GitHub Pages publishes the application's HTML, CSS, and JavaScript. It does **not** publish the actual capture data. The browser connects directly to your Dropbox account using **OAuth 2 authorization-code PKCE**.

- Use only the Dropbox **App key** in this app. An app key is a public identifier; do not paste or publish an app **secret**, Dropbox password, access token, or refresh token.
- The OAuth authorization credentials are kept **only in this browser tab's `sessionStorage`**; closing the tab requires reconnecting. This reduces persistence of credentials but does not eliminate risks from malicious browser extensions, a compromised device, or a compromised website.
- The Dropbox app needs `files.metadata.read`, `files.content.read`, and `files.content.write` so review status can synchronize.
- The website has a restrictive Content Security Policy and no third-party JS or external fonts.
- Publishing on GitHub Pages is appropriate for the *code*, not for private screenshots or tokens. Do not add captures to the GitHub repository.

### Important: Dropbox App Folder vs Full Dropbox

Your Shortcut currently writes to **`Dropbox/Apps/Capture Inbox`**, represented by the Dropbox API path `/Apps/Capture Inbox` for a Full Dropbox-access app. A **new Dropbox App Folder** application is confined to *its own* named folder, which is not necessarily the existing `Apps/Capture Inbox` folder. The fact that a folder lives under `/Apps` does not make it accessible to every App Folder API app.

**Easiest to connect to the existing folder:** Choose **Full Dropbox** access in Dropbox's App Console, then use `/Apps/Capture Inbox` as the folder path. **Security trade-off:** the credentials could access other Dropbox files within their granted scopes, not just captures. This app deliberately reads/writes only the configured folder, but Dropbox API permissions would still be broad.

**More restrictive:** Choose **App Folder** access. Before it can show any items, the working Shortcut's Dropbox destination must be updated so new captures land inside that OAuth app's own App Folder. If saved in the app folder root, set the app's folder path to blank. We recommend making a separate test copy of the Shortcut to verify the path before touching the working one.

## Deployment (GitHub Pages)

1. On GitHub, create a new **public** repository named `capture-inbox` under the `mojocolony` account. A public repository is required for GitHub Pages on plans without private Pages support.
2. Add `index.html`, `styles.css`, `app.js`, and `favicon.svg` from this package **at the root** of the new repository. `README.md` may also go there.
3. Open repository **Settings → Pages**. Select **Deploy from a branch**, choose the default branch (normally `main`) and folder `/ (root)`, and save.
4. The expected site URL is `https://mojocolony.github.io/capture-inbox/` (if the account/repository names above are used). Wait for Pages deployment, then open it.
5. In the app, click **Settings**, copy its *Redirect URI*, and register that **exact** value in your Dropbox OAuth app. Don't guess the URL if your Pages setup differs.

You can also try the demo locally by running `python3 -m http.server 8000` in this directory and opening `http://localhost:8000`. For OAuth, use an HTTPS GitHub Pages address (or localhost with its own registered redirect).

## Configure Dropbox OAuth

1. Visit <https://www.dropbox.com/developers/apps> and choose **Create app**.
2. Use **Scoped access**, then choose **Full Dropbox** (to connect without moving your existing archive) or **App folder** (restricted, with capture-folder migration as described above).
3. Choose an app name and save it.
4. Under **Permissions**, enable `files.metadata.read`, `files.content.read`, and `files.content.write`, then save/submit. Dropbox may retain additional required basic scopes for account identity.
5. Under the app's **Settings → OAuth 2 → Redirect URIs**, add the exact Redirect URI copied from Capture Inbox.
6. In Capture Inbox → Settings, paste your **App key**, *not* your App secret. Set the API folder path.
7. Click **Connect Dropbox**, authorize, and wait for your records to load. If you change permissions later, reconnect to grant the new scope.

If the URL you authorize for differs from the registered URI, Dropbox will reject the connection. If you choose **App Folder**, the API root and visible paths are **relative to the app folder**, not your Dropbox account root.

## File naming and data format

The app reads captures with matching base names, e.g.:

```
2026-10-18_10-55-00.txt
2026-10-18_10-55-00.png
```

TXT records should follow the existing Shortcut structure:

```
SOURCE: Google Chrome
SOURCE DETAILS: TITLE: A restaurant review
URL: https://example.com/restaurant-review
CAPTURED: October 18, 2026 at 10:55 AM
STATUS: Inbox
CONTENT:
Restaurant text recognized from screenshot.
```

TXT/PNG files are never rewritten when you review. Status/notes are stored separately in:

```
_capture_inbox_state.json
```

The `STATUS: Inbox` line in the *original TXT* always remains unchanged; the **review app's current status**, stored in JSON, takes precedence in the interface. Deleting this JSON file would reset review decisions but preserve original captures.

## Architecture / implementation notes

- HTML/CSS/vanilla JavaScript, no build system.
- Uses the standard Dropbox Web API with `fetch()`, OAuth 2 PKCE (SHA-256), and a short-lived access token plus tab-scoped refresh token.
- Lists Dropbox folder metadata, paginates as needed, loads TXT content in concurrent batches of up to 200 records, and loads screenshots only when viewed.
- Uses direct DOM text insertion (`textContent`) for captured data; only `http`, `https`, or Spark links may be opened.
- Saves state via `files/upload` with an update revision, retrying on concurrent edits. Single-entry changes are merged with the latest remote state.
- No continuous synchronization: click refresh to see new captures or other device changes. Per-action saves go to Dropbox immediately.

## Next enhancements

- Automatic review-queue refresh on tab focus or a controlled interval.
- Smarter titles and source-specific metadata extraction.
- Optional calendar/reminder/grocery dispatch *with confirmation*.
- Thumbnail caching, batching for very large libraries, and review keyboard shortcuts.
- Optional Mac/iOS home-screen icons and offline shell (without caching private data).
