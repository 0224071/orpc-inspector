# Preserve log

English | [繁體中文](./preserve-log.zh-TW.md)

Keep calls in the panel after a full reload or a navigation to another page, like **Preserve log** in the browser's Network tab. Use it when the call you need happens right before the page changes: a login that redirects, a form that submits and moves on, a 401 that sends you to the sign-in page.

## Turn it on

Tick **Preserve log** in the panel toolbar, next to **Clear**.

- It is off by default.
- Turning it on keeps the calls already in the list too.
- The choice is remembered for the browser tab. It survives reloads and navigations in that tab, and a new tab starts with it off.
- Turning it off deletes the saved copy at once. Calls already in the list stay until you clear them or reload.

The checkbox is disabled when the page cannot use `sessionStorage`, for example in a sandboxed iframe or with a privacy setting that blocks storage. Calls are still recorded; they just aren't kept across page loads.

## What comes back after a reload

On the next page load, the saved calls are added after the new page's own calls (and after its [SSR](./ssr.md) calls). A call is never listed twice. The list keeps its usual limit of 300 calls; the oldest go first.

Calls from an earlier page are marked:

- The row has a **Previous page** tag.
- The details say **From a previous page**.
- In a [copied report](./error-reports.md), the request line ends with `(Client · from a previous page)` or `(SSR · from a previous page)`.
- In the error report, the same error before and after a navigation is listed twice, not merged.

The mark stays through later navigations, so a call made two pages back is still marked.

## Calls that hadn't finished: Outcome unknown

A call that was still pending or streaming when the page was left comes back as **Outcome unknown** (with a `?` indicator). Its result can't be known: a `POST` that triggered the navigation most likely succeeded on the server, but the page never saw the response.

- Its input, attempts and the stream events received before leaving are kept. It has no duration.
- It is not counted as an error: not in the **Errors** filter, the dock badge or the error report.
- A copied report titles it `❔ Outcome unknown (page left before the call finished)`.

## Size limits

`sessionStorage` is small (about 5 million characters per site in Chromium) and the app shares it, so the saved copy has limits:

- A call whose data is over 64 KB is saved without its input, output, stream events and error data. Everything else stays, including the stream's event count. The details and reports show `(not preserved: 120 KB, over the 64 KB limit)` in their place.
- The whole copy stays within 1,000,000 characters. The newest calls are kept; older calls that don't fit are left out.
- When something was left out, the toolbar shows **Partially preserved**. Its tooltip gives how many calls were left out and how many were saved without their data. The note stays after a reload until you clear.
- When the browser refuses the write (the app's own data filled the storage), the toolbar shows **Not preserved: storage is full**, and the earlier copy is deleted so a reload never shows an outdated list.

## Clear

**Clear** also deletes the saved copy. Cleared calls never come back after a reload or a navigation.

## Back and Forward

When the browser restores a page from its back/forward cache, the page still has its own list, so nothing is restored into it. If you cleared the list on a later page, the restored page's list is cleared too. If you turned Preserve log off on a later page, the restored page stops saving.

A page restored this way saves its own list on its next change. That replaces the calls saved on the page you came back from.

## Apps on the same origin

The saved copy is per tab and per origin. Two apps served from the same origin and opened one after the other in the same tab share it, so the second shows the first one's calls as from a previous page.

## Production builds

Builds that include the inspector through the [`production` option](./production.md) get the same toggle, off by default. Their headers are already masked when the call is recorded; bodies are saved as they are, as on the dev server.

## What is saved, and who can read it

While Preserve log is on, the calls are written to the tab's `sessionStorage` on your app's origin, under two keys: `orpc-inspector:preserve-log:enabled` and `orpc-inspector:preserve-log:records`.

- **Headers are masked.** Request and response headers, the headers of each retry attempt, and headers inside error data whose names match the default pattern are saved as `***`. The default pattern matches `password`, `passwd`, `secret`, `token`, `cookie`, `credential`, `api_key` / `api-key` / `apikey`, `authorization`, `proxy-authorization` and session ids. The pattern you set in a report template doesn't apply here, because the page writes the copy whether or not the panel is open. Restored `***` values can't be revealed.
- **Bodies are not masked.** Input, output, stream events and error data are saved as they are. A login response's `accessToken`, or personal data in a response, is in `sessionStorage` in plain text.
- **Who can read it:** any script running on that origin, browser extensions with access to the page, and anyone using DevTools on that machine.
- **How long it stays:** until you turn Preserve log off, clear the list or close the tab.
- **To delete it now:** turn Preserve log off or click **Clear**. You can also remove the two keys in DevTools → Application → Session storage.

Turn it on only while you reproduce a bug, especially on a shared machine or with real user data.
