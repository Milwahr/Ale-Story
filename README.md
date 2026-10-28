# Stone & Story

A personal journey diary for recording travels through Azeroth. Write and edit entries, note the place and date, and attach images to each memory.

## Run locally

Install Node.js, then from this project directory run:

```sh
npm install
npm run dev
```

Open the local address printed by Vite. To create a production build, run `npm run build`.

## Host the website on GitHub Pages

The GitHub Actions workflow builds the app and deploys `dist/index.html` to GitHub Pages. In the repository, open **Settings → Pages**, set the build and deployment source to **GitHub Actions**, then push to `main` or run the **Deploy to GitHub Pages** workflow from the Actions tab. The production build puts the app's JavaScript and CSS directly in `dist/index.html`, so no separate assets are needed.

The source `index.html` at the project root is only the Vite development entry point; do not select the repository root as the Pages publishing folder. To publish manually instead, run `npm run build` and upload the contents of `dist`.

## Storage

Entries and attached image files are stored in the browser's IndexedDB database. Nothing is uploaded; the archive stays in this browser profile on this device. Clearing site data or changing browsers/devices will not carry entries over.

For future multi-device sync, a hosted service such as Supabase with Postgres for entry metadata and object storage for images would be a straightforward next step.