# Stone & Story

A personal journey diary for recording travels through Azeroth. Write and edit entries, note the place and date, and attach images to each memory.

## Run locally

Install Node.js, then from this project directory run:

```sh
npm install
npm run dev
```

Open the local address printed by Vite. To create a production build, run `npm run build`.

## Storage

Entries and attached image files are stored in the browser's IndexedDB database. Nothing is uploaded; the archive stays in this browser profile on this device. Clearing site data or changing browsers/devices will not carry entries over.

For future multi-device sync, a hosted service such as Supabase with Postgres for entry metadata and object storage for images would be a straightforward next step.