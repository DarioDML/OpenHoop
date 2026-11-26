# Lab report import (PDF or photo)

Date: 2026-11-26. Status: built on `feature/lab-import`.

## Goal

Let the user bring the values of their own lab report into Labs without typing every number, without
giving up the privacy promise: everything stays on the phone unless the user turns on a network
feature. Nothing is saved until the user has checked it, and the original file is never stored.

## Two reading paths

1. **On the phone (default, always offered).** The user picks a PDF or image (document picker) or
   takes a photo (camera). A local Expo module, `apps/mobile/modules/lab-reader` (Kotlin, Android
   only), turns it into text:
   - Photos: Google ML Kit Latin text recognition, bundled model.
   - PDFs: the embedded text layer through PdfBox-Android (`PDFTextStripper`, sorted by position).
     When there is no usable text layer, or the text layer gives no results, the pages are rendered
     with Android `PdfRenderer` (2000 px wide, at most 10 pages) and read with ML Kit.
   - OCR lines come back with bounding boxes; `src/data/labImport/rows.ts` groups them into table
     rows by vertical centre and joins the cells from left to right.
2. **With Claude (opt-in).** A new network feature `labs` (host `api.anthropic.com` only), switched on
   in Privacy next to the coach and maps. When it is on and a coach API key exists, the import screen
   offers "With Claude". The PDF goes as a `document` block, a photo as an `image` block (downscaled
   on the phone to 2000 px on the long edge, re-encoded as JPEG, which also drops EXIF data such as
   location). The request uses the coach's chosen model, structured output (`output_config.format`
   with a JSON schema, as the coach's `REPLY_SCHEMA`), and the coach's transport, timeout and error
   kinds (`postMessages` in `src/coach/api.ts`). The screen says plainly that the report leaves the
   phone and goes to Anthropic.

## Parser (`src/data/labImport/`)

Pure TypeScript, unit-tested with Dutch/Belgian and English PDF-text fixtures and an OCR-noisy fixture.

- `aliases.ts`: names per catalogue id (Dutch, English, lab abbreviations). Matching normalises
  accents and punctuation, strips specimen prefixes such as `S-`, refuses urine prefixes, and only
  accepts extra words after an alias when they are known qualifiers (`nuchter`, `berekend`, `IFCC`,
  …). So `Cholesterol/HDL ratio`, `Non-HDL cholesterol` and `Vitamine B12` are never guessed.
  The table is `Partial<Record<BiomarkerId, …>>`: a new catalogue id needs one line, and an id
  without aliases simply never matches.
- `units.ts`: printed units to catalogue labels (`mmol/l`, `mmol/I` from OCR, `ug/l`, `μg/L`, `mU/L`,
  `mE/l`, …). A catalogue match needs a unit that belongs to that biomarker; otherwise the line
  becomes an unmatched row. Unknown units are never converted.
- `parse.ts`: value (comma or dot, OCR `O`/`l` fixed inside numbers), `<`/`>` bounds flagged as
  censored, reference ranges (`3.9 - 5.5`, `70 tot 99`, `< 5.0`, `> 1.0`), and the sample date
  (lines with `staalname`, `afname`, `collected`, … first; birth and print dates ignored;
  day-first dates).
- `claude.ts`: request body, schema and validation of every field of Claude's answer (catalogue id
  or null, name length and control characters, finite non-negative numbers, range order, real past
  date, at most 200 results). Invalid entries are dropped and counted.

## Review screen (`src/app/health/labs-import.tsx`)

Every candidate is a card with an on/off switch, editable value, unit, date and range. Catalogue
matches start switched on, except censored values (`<0.5`), which start off and get a note
"On the report: <0.5" when saved. Unmatched rows start off and must be mapped to a catalogue marker
(the unit is kept only if it belongs to that marker, otherwise the user must pick one) or kept as
the user's own marker. "Save selected" runs every row through `validateLabDraft`; nothing is saved
while any switched-on row is invalid. Rows that fail to save stay in the list.

## Privacy notes

- The picked file is copied to the app cache by the picker and deleted right after reading
  (`discardReport`), on success and on failure. The file is never written to the database.
- On-device reading uses no network. ML Kit's bundled model ships inside the APK
  (`libmlkit_google_ocr_pipeline.so`, about 11 MB per ABI); nothing is downloaded.
- ML Kit does phone home by design: `com.google.mlkit:common` logs usage metrics through Google's
  `datatransport` (Firelog/CCT). The existing `withLocalNotificationsOnly` plugin already removes
  `TransportBackendDiscovery`, `JobInfoSchedulerService` and `AlarmManagerSchedulerBroadcastReceiver`
  from the merged manifest (checked in the debug build), so these events have no backend and no
  upload scheduler. This is checked in the manifest, not by watching traffic on a device.
- The Claude path sends only the chosen file, only when the user starts it, through the gate with
  the `labs` feature and its host list. The API key stays in SecureStore.
- Camera: only `CAMERA` is added (`RECORD_AUDIO` blocked, photo library permission off; storage
  permissions were already blocked).

## Choices and alternatives

- ML Kit over Tesseract: much better on phone photos, small API, bundled model. Tesseract would avoid
  Google's closed binary and telemetry but needs language data files and does worse on photos.
- PdfBox-Android over parsing PDFs in JS: real lab PDFs use CID fonts with ToUnicode maps that a
  small JS reader gets wrong. `PdfRenderer.Page#getTextContents` only exists from Android 15.
- No new dependency for downscaling: the Kotlin module does it.
- iOS: the module is Android only. On iOS the on-device path says it is not available; the Claude
  path still works for PDFs and for photos up to 3.75 MB.

## Not done / follow-ups

- Haemoglobin in mmol/L (common in the Netherlands) is not a catalogue unit, so such rows come in as
  unmatched. Adding `mmol/L` (factor 1.611) to `BIOMARKER_UNITS.haemoglobin` would fix it.
- New catalogue ids (albumin, creatinine, …) need one alias line each in `aliases.ts`.
- Real-device OCR quality has not been measured.
