# Chrome Web Store: remaining uploads

The dashboard draft for "Ṣafwa - Live Q&A Filter" (item id kmabhlppnbgeokjjlepnblnjjjpbefpj) already has: description, summary (locked to package), category Workflow and planning, language English (United States), privacy purpose, permission justifications, no-remote-code, data-use certifications, Unlisted visibility, all regions.

What is still missing, and exactly what to do:

## 1. Store icon (required)

- File: `store-assets/icon-128.png` (128x128 PNG, meets spec)
- Where: Store listing tab, Graphic assets section, "Store icon" slot, "Drop icon here"
- If drop fails, click the "Drop icon here" area and use the file picker

## 2. Screenshots (at least one required, upload all three)

- File 1: `store-assets/screenshot-1-teacher.png`
- File 2: `store-assets/screenshot-2-regex-dedup.png`
- File 3: `store-assets/screenshot-3-semantic.png`
- Where: Store listing tab, Graphic assets, "Screenshots" (up to 5), in that order
- Spec: 1280x800 PNG, already correct

## 3. Publisher email + verification (account-level, Settings page)

- Go to Settings: https://chrome.google.com/u/1/webstore/devconsole/fce477c1-2f42-482a-92b1-20a53b902c28/set
- Enter publisher contact email: jalaliwasim15@gmail.com
- If Google asks for email verification, complete it (the code arrives in that Gmail inbox; you can read it via the Gmail skill if the inbox is logged in)
- If a phone verification is requested, stop and tell Wasim to do it

## After the uploads

1. Click "Save draft" and wait for the saved toast
2. Confirm each slot shows a real thumbnail (not "Drop icon here", not a stuck progress bar)
3. Report the status of every required field on the item Status tab
4. DO NOT click "Submit for review". Stop and report when everything green except submission.
