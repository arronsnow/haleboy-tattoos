# Jotform booking report

Research date: 2026-10-21. Sources: the shop repo (`iloveyou-tattoo-main`, read-only) and Jotform's public pages, fetched without logging in. No test submission was sent, because a test would create a real entry in the shop's inbox.

## 1. How the shop embeds it today

| Page | What it embeds | How |
|---|---|---|
| `booking/index.html` (lines 168-182) | **Jotform App** `251847711631154` ("Tattoo Appointment Request") | A plain `<iframe id="JotFormIFrame-251847711631154" src="https://www.jotform.com/app/251847711631154?appEmbedded=1" loading="lazy" allow="geolocation; microphone; camera">`, fixed at 375x600 (`max-width:100%`) inside a styled frame, with the fallback link "Open it in a new tab". **There is no `jotformEmbedHandler` script on this page**, so the iframe does not auto-resize. |
| `piercingbooking/index.html` (lines 151-167) | Form `250787022365155` (piercing, **not our target**) | `<iframe src="https://form.jotform.com/250787022365155" scrolling="no" style="height:900px">`, plus `https://cdn.jotfor.ms/s/umd/latest/for-form-embed-handler.js` and `window.jotformEmbedHandler("iframe[id='JotFormIFrame-250787022365155']", "https://form.jotform.com/")`. |
| `tattoobooking/index.html` | none | A redirect to `/booking/`. |
| `eathan/index.html` | none | No Jotform reference. |

## 2. Form IDs

The app's public page (`https://www.jotform.com/app/251847711631154`, `window.__appInfo`) contains **one item**:

- **Form `250787056108157`**, "Tattoo Appointment Request", `formType: "CARD"` (one question per screen), owner `iloveyoutattoo143`, URL `https://form.jotform.com/250787056108157`. The app's own theme is dark brown (`#291D14`) and gold, set in Lora.

**This is the form that tattoo bookings go to.** The app is only a wrapper around it, so submissions land in form `250787056108157`'s inbox.

Facts taken from the form page (`https://form.jotform.com/250787056108157`):
- The HTML form posts to `https://submit.jotform.com/submit/250787056108157`. Files go through `https://upload.jotform.com/upload` (`JotForm.initMultipleUploads()`).
- **Conditional logic: none.** There is no `JotForm.setConditions` or `setCalculations` call.
- **Payments: none.** There is no `control_payment` field. `paymentExtrasOnTheFly` is Jotform's generic init code, not a payment field.
- **Captcha: none.** There is a hidden honeypot input, `name="website"`.
- The init code calls `JotForm.shuffleOptions("24")` and `shuffleOptions("36")`, so the artist and day options appear in random order.
- The welcome screen says "So happy to work with you! Fill out this form so we can get you booked as soon as possible!" with a START button.

## 3. Fields (form 250787056108157)

| Card | qid | Type | Label | POST name(s) | Required | Options and limits |
|---|---|---|---|---|---|---|
| 1 | 3 | control_fullname | Name | `q3_name[first]` (First Name), `q3_name[last]` (Last Name) | yes (both) | |
| 2 | 41 | control_mixed | Contact Info | `q41_contactInfo[field_1]` email (type=email), `[field_2]` phone (tel), `[field_3]` instagram (text) | yes (**all three**) | |
| 3 | 43 | control_mixed | Brief Description | `q43_briefDescription[field_1]` "what do you want?", `[field_2]` "where on your body do you want it?", `[field_4]` "style?", `[field_6]` "how big?", `[field_5]` "color?" | yes (all five) | Free-text placeholders: "rose with thorns and lots of leaves", "outer right forearm", "traditional", "7-9 inches", "yes, artists choice" |
| 4 | 10 | control_radio | Is this a coverup? | `q10_isThis` | yes | Yes / No |
| 5 | 14 | **control_fileupload** | Placement | `q14_placementLocation[]` | no | 1 file, max 2500 KB (shown as 2.4 MB). Accepts pdf, doc(x), xls(x), csv, txt, rtf, html, zip, mp3, wma, mpg, flv, avi, jpg, jpeg, png, gif. Description: "Standing naturally, take a photo of the whole area to be tattooed. camera should be at eye level" |
| 6 | 31 | control_textarea | If you would like a specific script, please look on fontspace.com to find a font you like and list it below. Also include what you want written here. | `q31_ifYou31` | no | |
| 7 | 21 | **control_fileupload** | Reference 1 | `q21_reference1[]` | no | Same limits as qid 14 |
| 8 | 22 | **control_fileupload** | Reference 2 | `q22_reference2[]` | no | Same |
| 9 | 23 | **control_fileupload** | Reference 3 | `q23_reference3[]` | no | Same |
| 10 | 24 | control_checkbox (max 1 selection) | Who would you like to book with? | `q24_whoWould[]` | yes | Jenni, Cory, Skylar, Millie, Gia, Jeremy, **Eathan**, Zoie, Savannah, first available, GUEST ARTIST. Description includes: "(Eathan is unavailable for "first available" at this time)" |
| 11 | 28 | control_radio | Have you been to I Love You Tattoo before? | `q28_haveYou` | yes | Yes, different project with you / No, I'm a new client / Yes, continuing a project with you / Yes, with a different artist |
| 12 | 36 | control_checkbox (max 5) | PREFERRED DAYS OF THE WEEK | `q36_preferredDays36[]` | yes | MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY, DOESNT MATTER |
| 13 | 25 | control_checkbox (max 3) | PREFERRED TIME OF DAY | `q25_preferredTime[]` | yes | Morning(9am-12pm), Early (12pm-3pm), Afternoon (3:00pm-5:00pm), Late (6:00pm-8:00pm), I want to book a full day, I want to book a half day, I am available any time |
| 14 | 30 | control_textarea | If you are looking for a specific date, please list below those dates, so we can try to accommodate you. | `q30_ifYou` | no | |
| 15 | 27 | control_textarea | Anything else we should know? Questions, Concerns? | `q27_Anything` | no | |

The sub-field keys above come from the form's HTML. In the API, a sub-field is normally written as `submission[3_first]` or `submission[41_field_1]`. This format was not tested.


## 4. Compared with the design's booking section

The design (`Main.dc.html`, `#book`) shows the steps 一 "Send your idea", 二 "Get a quote and a date" (contains the placeholder `[DEPOSIT AMOUNT]`) and 三 "Sit for your tattoo", next to a six-field form:

| Design field | Jotform equivalent | Gap |
|---|---|---|
| Name (one input) | qid 3, first and last name | Jotform needs two parts |
| Email or phone (one input) | qid 41: email **and** phone **and** instagram, all required | Design asks for one; Jotform requires all three |
| Your idea (textarea) | qid 43 field_1 "what do you want?" | |
| Placement (text) | qid 43 field_2, plus file qid 14 (placement photo) | |
| Size (select: Palm-size / Hand-size / Half sleeve or larger / Not sure yet) | qid 43 field_6 "how big?" (free text) | Select values can be sent as text |
| Reference images (multiple files) | qids 21, 22, 23 (one file each, 2.4 MB max) | File uploads, see below |
| (not in design) | Style, color (qid 43), coverup (10), artist (24), returning client (28), days (36), times (25), script (31), dates (30), notes (27) | Seven of these are required |

The form has 10 required inputs that the design does not show.

## 5. Recommendation: (b) embed the Jotform form

**Approach (b): embed form `250787056108157` directly, not the app wrapper, themed with custom CSS pasted into Jotform's form designer.** Reasons:

1. **File uploads are central to this form, and the API can't take them.** It has four upload fields, and the placement photo is what the artist draws from. Jotform calls API v1 "mostly read only" ([API docs](https://api.jotform.com/docs/)). Jotform support has repeatedly said files can't be uploaded through the submissions endpoint, only a URL to an existing file, and that external URLs get the Jotform URL prepended, which breaks the link ([answer 1415415](https://www.jotform.com/answers/1415415-upload-files-via-the-api), [answer 12090701](https://jotform.com/es/answers/12090701-jotform-api-upload-a-file), [answer 9512511](https://jotform.com/pt/answers/9512511-send-files-through-api-external-file-urls-are-prepended-with-jotform-url)). The brief says to embed in this case.
2. A native form would have to rebuild 15 cards and 10 required inputs that the design doesn't show, so it wouldn't match the design anyway. It would also drift whenever the shop edits its form, for example to add an artist.
3. Embedding keeps the shop's workflow intact: the same inbox, notification emails and autoresponders, and no API key to store.
4. No conditional logic or payments get in the way of embedding.

**Fields that cannot be submitted cleanly through the API:** qid 14 (Placement photo), qid 21, qid 22 and qid 23 (References 1-3). Every other field could be posted.

How we would build it:
- Use `<iframe id="JotFormIFrame-250787056108157" src="https://form.jotform.com/250787056108157?whoWould=Eathan" title="Tattoo booking request">` together with `for-form-embed-handler.js` and `jotformEmbedHandler(...)`, the way the piercing page does, so the iframe auto-resizes. Load the handler script with `defer`, and lazy-load the iframe so the Lighthouse scores aren't hurt.
- Pre-select the artist with Jotform's URL prefill (`whoWould=Eathan`). The exact parameter syntax for a checkbox field has not been verified; check it in a browser.
- Put the 一 二 三 steps beside the iframe, as in the design.
- Deliver `jotform-haleboy.css` (black / bone / red, Dela Gothic One headings) and the steps to paste it in: Form Builder, then Form Designer (paint roller), then Styles, then Inject custom CSS.

**Main risk: the CSS applies to the shop's shared form.** Custom CSS injected into form `250787056108157` would also restyle the shop's own `/booking/` embed, which uses a brown and gold theme. See question 1.

A possible option (c), not verified: post a native, multipart form directly to `https://submit.jotform.com/submit/250787056108157`. Classic forms accept this kind of post, but this card form uploads files asynchronously through `upload.jotform.com` and sends a `jsExecutionTracker` field. Whether files survive a direct post is unknown. It would need a test submission, which I did not send. I don't recommend it.

## 6. Open questions for the user

1. **Theming conflict.** Should we (a) **clone** the form in the shop's Jotform account as "Haleboy - Tattoo Request" and theme only the clone, or (b) inject our CSS into the shared form and accept that the shop's booking page is restyled too? Notification emails can go to the same address, but a clone's submissions would appear in a separate form inbox. Either way, someone needs access to the `iloveyoutattoo143` Jotform account.
2. **Is Haleboy listed as "Eathan"** in the artist field? The portrait file is `Eathan.jpg` and the shop has an `/eathan/` page, which suggests he is. If so, `whoWould=Eathan` is the right prefill value.
3. Should the design's six-field form be dropped in favor of the embed? The embed is a different look: one question per card, with a START screen.
4. Is the form's 2.4 MB upload limit acceptable? Phone photos are often larger. Only the form owner can raise it.

## Unknowns

- The exact API sub-field key format, the checkbox prefill syntax, and whether a direct multipart post accepts files. All three need a live test.
- Any settings hidden behind the Jotform login: notification and autoresponder recipients, the thank-you page, and spam filters.

## 7. Custom theme for the embedded form (added after the checkpoint review)

CSS on our page cannot reach inside the Jotform iframe, so the look is delivered as a stylesheet that is pasted into Jotform itself:

- **File:** `site/docs/jotform-haleboy.css`. It uses the site tokens (`--black`, `--bone`, `--red`, `--ash`, `--ash-dim`, `--ink`, `--field-border`) and Dela Gothic One / Zen Kaku Gothic New. It mirrors the design booking panel: a black card with a 3px bone border, 50px black fields with `#5A5753` borders, a solid red Next/Submit/Start button, square corners, and visible focus rings. The motion reset sits under `prefers-reduced-motion`.
- **Local preview:** run `npm run dev` from the `Haleboy` folder and open `http://localhost:4321/`. The `/form` route fetches the live form and injects this CSS the same way Jotform will. Submitting is blocked in the preview. The page also shows the unthemed form and the shop's current app embed for comparison.
- **Checked in headless Chrome** (640px wide): the welcome screen, the name, description, placement upload, script text and radio cards. The scenario got past the required artist card without clicking anything, so the `?whoWould=Eathan` prefill appears to work. That is inferred from the navigation, not seen on screen.

**How to apply it in Jotform** (needs the `iloveyoutattoo143` login; see question 1 about cloning first):
1. Open Jotform, go to My Forms, and open "Tattoo Appointment Request" (or its Haleboy clone) in the Form Builder.
2. Click the paint roller (Form Designer) at the top right.
3. Open the **Styles** tab and scroll to **Inject custom CSS**.
4. Paste the whole contents of `jotform-haleboy.css` and save.
5. Optional: in Settings, remove or replace the welcome-screen logo. The CSS hides the form header logo, but the cardinal logo on the welcome screen is part of the form content.
6. Open `https://form.jotform.com/<form id>` and check the welcome screen and a few cards.

Not themed or not checked: the review screen, the thank-you screen, error states after a failed Next, and phone widths below 640px.
