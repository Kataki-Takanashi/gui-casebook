# Casebook Studio design language

## Structure
- The case is the center. Sessions, proof, skill claims, and portfolio stories live on the case page.
- Three pages: Cases (home), Skills, History. Everything else is a dialog or the casebook menu.
- One primary action per screen. "Log session" is always in the top bar.

## Forms
- Show only what a person has to decide. Anything that can be worked out goes under "More".
- Infer, don't ask: IDs, hours, details from the case and the last session, proof type from the file.
- Typed values become suggestions. Files attach where the work is logged and become proof on that case.
- Dropdowns use the workbook's own lists, so customized sheets keep working.
- Save names its Kimai effect: "Save and add 2h to Kimai".

## Dialogs
- Below 760px a form is a full-screen sheet. Escape closes an open menu first, then the dialog. Unsaved changes ask "Discard your changes?"
- Delete and Undo take two clicks. The second names the record ("Delete 2026-001?").

## Writing
- No explanatory text, banners, or taglines. Labels carry the meaning.
- Errors and empty states: plain words, say what to do, offer the one button that fixes it. No dashes.

## Visual
- Tokens live in `app/globals.css`, light and dark. Neutral surfaces, one accent (teal `--primary`). No accent bars or eyebrows.
- `--field-border` outlines fields; `--border` only divides. Success, warning and danger are text and background pairs. `--destructive` fills an armed delete.
- Green only for Verified or Approved. Warning for Needs Correction. Danger for Rejected and Safety Stop. Met, Not Yet and Pending stay grey.
- Time class shows strength: T1 accent fill, T2/T3 grey, T4/T5 outline only.
- System font. Weights 400, 500, 600; 650 for the page title only. Monospace only for IDs. Tabular numbers for hours.
- 4px spacing base. Lists are rows in one bordered container, on fixed column tracks so they line up. Selection shows by background only.
- Motion is 200ms or less and only carries meaning. Reduced motion keeps the fades.
- Hover effects only on devices that hover. Touch targets at least 40px, 44px in dialogs.
