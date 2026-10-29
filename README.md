# Stone & Story

A public journey chronicle for recording travels through Azeroth. Anyone can read entries and view their photos. Signed-in authors can create, edit, and delete their own entries.

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

## Supabase storage setup

The site uses Supabase Postgres for entries and Supabase Storage for photos. GitHub Pages remains the static website host; Supabase provides the persistent cloud storage and authentication.

1. Create a Supabase project.
2. In the Supabase SQL Editor, run [`supabase/schema.sql`](./supabase/schema.sql). It creates the entries table, public-read/authenticated-author row-level security policies, and a public photo bucket. Each signed-in author can only change their own entries and images.
3. Enable email sign-in in **Authentication → Providers**. In **Authentication → URL Configuration**, set the site URL to your deployed website and add its URL (and `http://localhost:5173` for local development) to the allowed redirect URLs.
4. Copy `.env.example` to `.env.local` and fill in the project URL and publishable/anon key from **Project Settings → API**:

   ```dotenv
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-public-publishable-or-anon-key
   ```

   The publishable/anon key is intended for browser use. Never put a Supabase service-role key in this website.
5. To configure GitHub Pages builds, add repository Actions variables named `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under **Settings → Secrets and variables → Actions → Variables**. These values are embedded into the public website at build time; database and storage access is protected by the SQL policies.
6. Run `npm run dev` or push to `main` to build and deploy the site.

Entries and photos are public once posted. Anyone may register/sign in if email sign-up is enabled in Supabase, but database policies limit each author to changing only their own entries. Disable public sign-up in Supabase if you want to restrict who can write.

## Importing existing entries

After deploying the cloud-backed site, sign in using the same browser profile that contains your older entries. If the site finds an IndexedDB archive on that same website origin, it offers an **Import browser archive** button. Import copies entries and photos to Supabase; it does not delete the browser copy. Local archives from a different browser or website origin are separate and will not be detected.