# Deploying so a friend can try it

The app is fully static — plain HTML/CSS/JS, no server, no backend. Hosting it
means uploading a folder of files to a service that runs on *their*
infrastructure, so your own computer is never exposed and can be off while the
link works.

Each visitor's data lives only in their own browser (IndexedDB). There is no
shared database, so there is nothing to leak and no privacy risk to you. Your
local test threads are **not** in the build — only the "Load example" fixture
ships.

## Netlify drag-and-drop (no account needed to start, ~2 minutes)

1. Build the site:

   ```sh
   npm install      # first time only
   npm run build
   ```

   This creates a `dist/` folder.

2. Go to **https://app.netlify.com/drop** in your browser.

3. **Drag the `dist/` folder** onto that page.

4. Netlify gives you an `https://…netlify.app` link. Send it to your friend.
   Done — it's live, HTTPS, and your machine is not involved.

To update it later: run `npm run build` again and drag the new `dist/` folder
onto the same Netlify site (or app.netlify.com/drop for a fresh link).

## Sharing an actual analysis

Hosting lets your friend *use* the tool, but you each get your own private
canvas — there's no shared data. To exchange work, use the built-in exports
(**Export ▾** menu, top right):

- **Share file (.html)** — a self-contained, read-only snapshot of your
  analysis. Send the file; they open it in any browser. Best for "here's what
  I concluded."
- **JSON backup (.rcanvas.json)** — your full editable graph. They load it via
  **Import backup** on the home screen, edit, then export and send back. This
  is the "see each other's questions" loop, done by passing a file.

## Other hosts (equivalent, if you prefer)

Any static host works the same way — upload `dist/`. Vercel and Cloudflare
Pages both connect to a GitHub repo and auto-rebuild on push; `netlify.toml` in
this repo already declares the build command and SPA redirect for any of them.
