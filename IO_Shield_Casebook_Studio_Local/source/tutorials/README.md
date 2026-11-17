# Tutorial clips

The short looping videos in the app's Help menu and Kimai dialog. Each clip has a script here, so it can be
re-recorded when the interface changes. Output goes to `web/public/tutorials/` and ships with the next build.

One-time setup, from `source/`:

1. `npm install`
2. `npx playwright install ffmpeg` (Playwright uses your installed Google Chrome; this only adds its video encoder)

Record a clip: `node tutorials/log-session.mjs` (or `connect-kimai`, `import-kimai`), then `npm run build`.

The in-app clips use a throwaway copy of the app on port 8792 and a fake Kimai (`mock-kimai.mjs`) on 8799,
so no real casebook or Kimai data ever appears in them.

The Kimai API token clip uses a real Kimai login. Run `node tutorials/kimai-login.mjs <profile-folder>` first,
sign in, and keep that folder outside the repo. Delete the token the clip creates afterwards.

Rules: clips stay under 12 seconds (checked automatically), captions have no dashes, and anything secret
is blurred before it appears on screen.
