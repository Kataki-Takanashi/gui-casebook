# I/O Shield Casebook Studio

A local app for keeping your Field School casebook up to date. You log sessions, proof, skill claims and portfolio stories in the app, and it writes them back into your own casebook (.xlsx).

It runs on your own computer, so nothing goes to a website. Kimai sync is optional.

## Use it

1. Download the zip for your computer (Windows, Mac or Linux) from **Releases**.
2. Unzip it somewhere you keep, such as Documents.
3. Double-click the Start file:
   - **Windows:** `Start_Casebook_Windows.cmd`
   - **Mac:** `Start_Casebook_Mac_Linux.command`
   - **Linux:** run `sh Start_Casebook_Mac_Linux.command` in a terminal.
4. The app opens in your browser. Drop your casebook on the start page.

There's nothing to install. The download includes everything it needs.

## Docs

| | |
|---|---|
| [User guide](IO_Shield_Casebook_Studio_Local/GUIDE.md) | How to use the app: sessions, the timer, cases, proof, skills, Kimai, backups, reviewer mode |
| [START_HERE](IO_Shield_Casebook_Studio_Local/START_HERE.txt) | Install, where your data lives, limits, troubleshooting |
| [API](IO_Shield_Casebook_Studio_Local/API.md) | The local API for scripts and agents |
| [Build notes](IO_Shield_Casebook_Studio_Local/source/README-BUILD.md) | Working on the code |
| [Design notes](IO_Shield_Casebook_Studio_Local/source/DESIGN.md) | How the interface should look and behave |
| [Help clips](IO_Shield_Casebook_Studio_Local/source/tutorials/README.md) | Re-recording the clips in the Help menu |

## Make a new release

Needs Node.js 22.13 or newer.

```bash
cd IO_Shield_Casebook_Studio_Local/source
npm install
npm run release
```

That makes three zips (Windows, Mac and Linux) in a `release` folder at the top of the repo. Upload them on the repo's Releases page.

## Run from source

```bash
cd IO_Shield_Casebook_Studio_Local/source
npm install
npm run build
cd ..
node server.mjs --open
```

To run the checks, from `source/`:
- `npm run test:ui` checks the interface. The app must be running.
- `node test-local.mjs ../../IO_Shield_Field_School_Casebook.xlsx` checks the data handling.
