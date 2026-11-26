# Copying error reports

English | [繁體中文](./error-reports.zh-TW.md)

Copy failed calls as a message you can paste into an issue or chat.

## Copy

| To copy | Click |
|---|---|
| All errors and validation failures in the filtered list | **Copy error report** in the toolbar |
| One call | **Copy report** in the call's detail header |

The arrow next to either button switches the format: **Markdown**, **Discord** or **LINE**. The main button reuses the last one.

## Customize a platform or prepare a report for an agent

1. In **Settings → Report templates**, select the closest template and click **Copy as new template**.
2. Rename the copy and choose syntax in **Quick** or fine-tune it in **Advanced**. The preview uses visible errors, a selected call, or a labeled example.
3. To put failure and reproduction context above the bodies, choose **Diagnostic** under **Report layout**. Choose the copy from either report menu.

Before sharing, check for sensitive text outside masked fields and add any environment or setup steps not captured by the inspector. The report does not replay calls.

## Change what a report includes

1. Open **Report settings…** from that arrow menu, or **Settings → Report templates**, and switch to **Advanced**.
2. Under **Sections**, **Issue fields / error message** includes or leaves out the issues (path, code, message, actual value).
3. Under **Issue messages → Message**, pick **Original only**, **Translated** or **Translated, then original**. Translations need [`zodLocale`](./zod-locale.md); issues without one keep the original.
4. Under **Masking**, set the key pattern (regex, case-insensitive).

For a single call, the Input, Response and header sections in its details have include toggles. They reset when you select another call. For a stream with no response body, the Response toggle is on **Events**.

## Retries and streams

- When a call made more than one attempt, the request fields add a line such as `Attempts: 3 (503 → 503 → 200)`. It follows the Request section.
- A streamed call's events follow the response, labeled with the count, for example `Events (150, last 100)`. After a reconnect they are grouped by attempt (`attempt 1`, `attempt 2`, …). They follow the Response section and are masked and trimmed like the response.

## What gets masked

- Keys that match the masking pattern, in the input, the output, stream events and the headers, are replaced with `***`. Values under other keys are copied as they are.
- The default pattern matches `password`, `passwd`, `secret`, `token`, `cookie`, `credential`, `api_key` / `api-key` / `apikey`, `authorization`, `proxy-authorization` and session ids.
- An empty pattern turns masking off. The panel hides headers with the same pattern.
- Response headers inside a non-oRPC backend's error data are masked too.
- SSR records replace sensitive headers with `***` on the server, before they reach the page ([SSR](./ssr.md)).
