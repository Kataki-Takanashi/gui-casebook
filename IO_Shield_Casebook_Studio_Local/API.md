# Casebook Studio local API

Scripts and agents can read and change a casebook through the same API the app uses.

- It only listens on this computer (`127.0.0.1`). No token is needed.
- Every change is logged in History, the same as an edit in the app, and can be undone there.

Base address: `http://127.0.0.1:8765/api` (or the `CASEBOOK_PORT` you set).

## Rules

- **Send this header with every change:** `X-Casebook-Source: script`. History then marks the change "from a script".
- **Writes from other websites are refused.** Send no `Origin` header, or the app's own.
- **Each change needs the casebook's current `revision`:**
  - If someone changed the casebook since you read it, you get `409` and nothing is saved. Read again, then retry.
  - A successful change returns the new `revision`.
- **Errors** come back as `{"error":"..."}` in plain words, for example "Complete What I Worked On."
- **Validation is the same as the app's,** including hours, dates, required fields and IDs.

## Sheets

The sheets you can write to, as the API names them:

| Sheet | What it holds |
|---|---|
| `Case Register` | Cases and parent projects |
| `Session Ledger` | Logged sessions |
| `Evidence Index` | Proof records |
| `Competency Evidence` | Skill claims |
| `Portfolio` | Portfolio stories |

Each record is a row number plus its values by column letter, for example `{"A":"2026-001-S004","B":"2026-11-19",...}`. Data starts at row 5.

To see the column names and current values, read the records first.

## Read

| Request | Returns |
|---|---|
| `GET /books` | Your casebooks: `id`, `name`, `revision` |
| `GET /books/:id` | Everything: workbook data, app edits, attached files |
| `GET /books/:id/records/:sheet` | One sheet's records with app edits applied: `{revision, records:[{row, values}]}`. URL-encode the sheet name |
| `GET /books/:id/history` | The last 100 changes |
| `GET /books/:id/export` | The updated Excel file |

## Change

| Request | Body |
|---|---|
| `PUT /books/:id/entries` | `{"sheet","row","revision","values"}` to add or edit one record. Use `"row":"new"` to add at the first free row |
| `POST /books/:id/entries/delete` | `{"sheet","row","revision"}` to clear one record |
| `POST /books/:id/files` | Form upload with a `file` field. Returns a `ref` to put in a proof record's column F |

## Example: log a session

```bash
B=http://127.0.0.1:8765/api
ID=$(curl -s $B/books | python3 -c "import json,sys;print(json.load(sys.stdin)[0]['id'])")
REV=$(curl -s $B/books/$ID | python3 -c "import json,sys;print(json.load(sys.stdin)['revision'])")
curl -s -X PUT $B/books/$ID/entries \
  -H "Content-Type: application/json" -H "X-Casebook-Source: script" \
  -d '{"sheet":"Session Ledger","row":"new","revision":'$REV',"values":{
        "A":"2026-001-S004","B":"2026-11-19","C":"2026-001","D":"Mapped the lab switches",
        "E":"Practical","F":"Training","G":"03","I":"T1","J":"18:00","K":"19:30","L":"1.5","P":"1"}}'
```

## Undo

Open History in the app and press Undo on the change. Only the latest change to each record can be undone.
