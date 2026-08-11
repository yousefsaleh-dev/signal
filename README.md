# SIGNAL

SIGNAL is a focused startup discovery MVP built with Next.js 16 App Router. Supabase is the source of truth; the public index is empty until real startups are published.

## Run locally

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and add Supabase and Gemini credentials. Run migrations `001` through `004` in a Supabase project (or use `supabase/schema.sql` as the consolidated version). The schema creates profiles, startups, votes, feedback, investor interest, saves, view tracking, notifications data access, storage policies, and the launch/count triggers.

## Main flows

- Discover: search, filter, rank, vote, save, and share launches.
- Startup details: inspect signal readout, post feedback, and request an intro in investor mode.
- Founder studio: create/edit a startup, save drafts, upload a logo to Supabase Storage, launch/unlaunch, and review investor interest.
- Signal Match: server-side Gemini route at `/api/ai/match`, reading only launched Supabase startups and returning validated structured match cards.
- Public startup URLs: `/startup/[id]` redirects launched startups into the app and returns Next’s not-found experience for drafts/private launches.
