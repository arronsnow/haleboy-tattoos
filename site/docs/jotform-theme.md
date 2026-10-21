# Theming the Jotform booking form

The booking section embeds the shop's Jotform card form `250787056108157` in an iframe (see `jotform-report.md` §5 for why). CSS on our page can't reach inside that iframe, so the site's look has to be added in Jotform itself. The stylesheet is `public/jotform-theme.css`. It is also served by the live site at `/jotform-theme.css`.

## Before you start

- You need the shop's Jotform login (`iloveyoutattoo143`).
- Keep using form `250787056108157`, so bookings land in the shop's existing inbox. Don't clone it: a clone has its own inbox, and staff watching the original would miss Haleboy's bookings.
- Injected CSS applies to every page that shows the form, including the shop's own `/booking/` page, which uses a brown and gold theme. **Agree with the shop before pasting the CSS**, since their page will switch to this black, bone and red look too. If they'd rather keep their theme, skip this guide: the embedded form still works and submits to the same inbox, just in the shop's style.

## Paste the CSS

1. Open Jotform, go to **My Forms**, and open "Tattoo Appointment Request" in the **Form Builder**.
2. Click the paint roller icon (**Form Designer**) at the top right.
3. Open the **Styles** tab and scroll down to **Inject custom CSS**.
4. Paste in one of these:
   - **The whole contents** of `public/jotform-theme.css`. This always works.
   - **Or one line**, so the form picks up later changes to the file without another paste:
     ```css
     @import url("https://<your-site-domain>/jotform-theme.css");
     ```
     Jotform has to fetch the file from the live site, so this only works after you deploy.
5. Click **Save** (changes in the designer save automatically, but confirm the "Saved" notice).
6. Optional: in **Settings > Welcome Page**, remove the shop logo. The CSS hides the header logo, but the welcome-screen logo is form content.

## Check it

1. Open `https://form.jotform.com/250787056108157?whoWould=Eathan` on a desktop and on a phone.
2. Go through the welcome screen and a few cards. The background is black, cards have a 3px bone border, fields are black with grey borders, and Start/Next/Submit are solid red.
3. Press Tab through a card. Every field and button shows a visible ring.
4. Click Next on an empty required card. The error sits in a black box with a red border.
5. Below 480px wide, the Next and Back buttons fill the width and the name fields stack.
6. Reload the site's booking section. The iframe grows to fit the form (the auto-resize script loads after the form does).

To preview without touching Jotform, run `node site/docs/preview/serve.mjs` and open `http://localhost:4321/form`. It loads the live form with this CSS injected and blocks submissions.

## Not themed

The thank-you screen's layout and Jotform's built-in error toasts come from Jotform and may change. Recheck them after Jotform updates its card form.
