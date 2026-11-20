# Casebook Studio user guide

Casebook Studio keeps your Field School casebook up to date without editing the spreadsheet by hand. You log your work here, and the app writes it back into your own casebook file.

Everything stays on your computer. It never goes to a website.

To install and start the app, see START_HERE.txt. This guide covers using it.

## 1. Get started

1. Start the app with the launcher for your computer. It opens in your browser.
2. Drop your casebook (.xlsx) on the start page, or click **Choose file**.
   - **No casebook yet?** Ask Will for the Field School casebook.
   - **Casebook in Google Sheets?** In Sheets, use File > Download > Microsoft Excel (.xlsx), then import that file.
3. Your casebook opens on **Cases**. Your name comes from the Analyst Profile sheet.

Your .xlsx file on disk does not change while you work. To get the updated file, see [Get your updated casebook](#11-get-your-updated-casebook).

## 2. Find your way around

- **Cases** (home): your cases, grouped under their parent projects, with your tracked hours at the top.
- **A case page**: everything for one case, in one place: sessions, proof, skill claims and portfolio stories.
- **Skills**: every skill you've claimed, with your level and what the next level needs.
- **History**: every change, newest first, with Undo.
- **The casebook menu** (your name, top right): Kimai, Check casebook, Upload limits, Backups, downloads, and Import casebook.

Labels with a **?** next to them have a short definition in Will's words. Click the **?** to read it.

## 3. Log a session

There are three ways to start:

- Click **Log session** in the top bar, or press **L**. On a case page it fills in that case.
- Click the clock on a case's row.
- Use the timer (see [Use the timer](#4-use-the-timer)).

Then fill in the session:

1. **What I Worked On**: say what you did, in a sentence or two.
2. **Start** and **End**: the times you worked. **Hours** fills in by itself; type hours instead if you have no times.
3. **Time Class**: how well the time is proven. Don't guess old hours.

   | Class | Meaning |
   |---|---|
   | **T1** | Exact tracked time |
   | **T2** | Reconstructed from records |
   | **T3** | Proven minimum time |
   | **T4** | Work known, hours unknown (no hours) |
   | **T5** | Recollection awaiting proof (no hours) |

4. **Proof**: click **Attach**, or drop or paste a screenshot or file anywhere on the form. Each file becomes a proof record on the same case.
5. Click **Save**.

The rest is filled in from the case and your last session. **More** shows those fields, with a one-line summary of what was filled in.

**If something is wrong:** Save tells you, and each field that needs fixing says why right under it.

## 4. Use the timer

1. Click the timer icon in the top bar when you start working. On a case page, it remembers that case.
2. Click **Stop** when you finish. Log session opens with the date, start and end already filled in.

The timer keeps running if you close the browser or the computer sleeps, and it works without Kimai. To throw a running timer away, click the **×** next to it, then click again to confirm.

## 5. Cases and projects

- **New case** (or press **N**): give it a name, a Type and Context, a Main Domain, what you did, and its scope or permission.
- **Parent projects** group smaller cases. On a parent project, **Add case to project** creates a case inside it.
- A new case started from inside a case goes under the same parent project.
- To edit a case, click the pencil next to its title.

## 6. Proof

- Files you attach to a session or a claim become proof records automatically.
- To add proof on its own, click **Add proof** on a case, then pick a file, choose one you've already uploaded, or paste a link.
- In **What It Shows**, write what the proof actually shows, not just the file name.

**Limits:** by default a file can be up to 10 MB, and a casebook can hold 100 files or 40 MB in all. These count everything stored in that casebook, not one upload. Change them under casebook menu > **Upload limits**.

Files from a form you cancel are removed again, so they don't count.

## 7. Skill claims

1. On a case, click **Claim skill**.
2. Pick the **Skill**. Skills in the case's domains are listed first.
3. Tick the **Proof** that shows it.
4. Choose your **Work Level** and **Result**.

New claims start as **Pending Review**. Only the reviewer verifies or rejects them.

**The Skills page** groups your claims by skill and shows:

- your current level, from your highest verified claim;
- what the next level needs, from Will's Advancement Rules. For example: "Toward Supervised: 1 of 2 verified demos". Hover over it for the full rule.

These are minimums. The reviewer makes the final call.

## 8. Portfolio stories

1. On a case, click **Write story**.
2. Click a story's title to edit it, or **Preview** to see it as a page.
3. To download it as a web page, both of these are needed:
   - set **Cleaned Up?** to Yes;
   - tick **Reviewed and OK to share**.

## 9. Kimai

Kimai is optional. If you use it, the app keeps your sessions and Kimai entries in step both ways.

**Connect**

1. Casebook menu > **Connect Kimai**.
2. Paste your Kimai API token. **How to get an API token** shows where to make one.
3. Click **Connect**.

**What happens after that**

- **New sessions:** T1 sessions are added to Kimai when you save. The Save button says so ("Save and add 1h 30m to Kimai"). For T2 and T3 time, pick a Kimai activity yourself if you want it in Kimai.
- **Linked sessions:** editing a session that's already in Kimai asks first, because it changes the Kimai entry too. Tick **Don't ask again** if you don't want to be asked.
- **The bar on Cases** shows what's new. Click **Review** to see:
  - **New in Kimai**: entries you can import as sessions. Pick the case, tick them, and import.
  - **Not in Kimai yet**: sessions you can add to Kimai.
  - **Changed on both sides**: choose which version to keep.
  - **Removed**: entries deleted on one side.
- **If Kimai is offline,** the app keeps working with your last sync.

Imports and adds can be undone from the message that appears right after.

## 10. History, undo and delete

- **History** lists every change by day.
  - **Undo** puts back the latest change to a record. It asks first and says what it will do.
  - Changes from Kimai, a script, or a reviewer are labelled.
- To delete a record, open it and click **Delete**, then click again to confirm. You can undo it from the message or from History.
- **Changed in another window:** if a record changed in another window while you were editing it, you'll be asked to **Use theirs** or **Keep mine**.

## 11. Get your updated casebook

The casebook menu shows **Download Excel · N changes** until you download.

- **Download Excel**: your casebook with every change written in. Open it in Excel or LibreOffice to recalculate the formulas.
- **Download Excel + proof files**: a .zip with the casebook, your proof files and the change history. Keep the contents together.
- **Download the file you imported**: the untouched original.

**Google Sheets:** download the Excel file, then import it into your Sheet.

## 12. Check your casebook

Casebook menu > **Check casebook** lists anything missing or that doesn't add up. For example:

- a session with no hours;
- a T1 session with no times;
- a claim with no proof, or proof from another case;
- a case with no Main Domain;
- a duplicate ID.

Click an item to open it and fix it.

## 13. Backups

Once a day the app copies all your casebooks and proof files. The last 14 days are kept.

Casebook menu > **Backups** lists them and has **Back up now**. It also explains how to go back to one.

## 14. Shortcuts and help

| Key | Does |
|---|---|
| **L** | Log session |
| **N** | New case |
| **/** | Search |
| **?** | Help |
| **Escape** | Closes the open menu first, then the form (it asks before throwing away changes) |

**Help** (the ? in the top bar) has short clips: log a session, connect Kimai, import from Kimai, and get an API token.

## 15. For the reviewer

Reviewer mode is only offered on the reviewer's own copy of the app.

**Turn it on**

1. Put a file named `reviewer.txt`, containing your name, in the app's data folder.
2. Restart the app.
3. Casebook menu > **Reviewer mode**.

**The Review page**

- **Skill claims waiting:** Verify, With correction, or Reject. Each decision records your name and the date.
- **Portfolio stories waiting:** Approve or Do not publish.
- **Hours:** a month's sessions and total. Filter by time class and by whether they are in Kimai, for the monthly check.

Every decision shows in History and can be undone.

## 16. If something goes wrong

| Problem | What to do |
|---|---|
| The page won't open | Make sure the launcher window is still open; closing it stops the app. Then reload the page |
| "Casebook Studio is not running" | Start the app again. What's on screen is not lost |
| "Changed in another window" | Choose **Use theirs** or **Keep mine** |
| Kimai says offline, or won't accept your token | Make a new token in Kimai, then casebook menu > **Kimai** > connect again |
| Port already in use | See Troubleshooting in START_HERE.txt |

Scripts and agents can use the app too. See API.md.
