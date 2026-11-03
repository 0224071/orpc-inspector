# Copying error reports

English | [繁體中文](./error-reports.zh-TW.md)

Copy failed calls as a message you can paste into an issue or chat.

## Copy

| To copy | Click |
|---|---|
| All errors and validation failures in the filtered list | **Copy error report** in the toolbar |
| One call | **Copy report** in the call's detail header |

The arrow next to either button switches the format: **Markdown**, **Discord** or **LINE**. The main button reuses the last one.

## Change what a report includes

1. Open **Report settings…** from that arrow menu, or **Settings → Report templates**, and switch to **Advanced**.
2. Under **Sections**, **Issue fields / error message** includes or leaves out the issues (path, code, message, actual value).
3. Under **Issue messages → Message**, pick **Original only**, **Translated** or **Translated, then original**. Translations need [`zodLocale`](./zod-locale.md); issues without one keep the original.
4. Under **Masking**, set the key pattern (regex, case-insensitive).

For a single call, the Input, Response and header sections in its details have include toggles. They reset when you select another call.

## What gets masked

- Keys that match the masking pattern, in the input, the output and the headers, are replaced with `***`. Values under other keys are copied as they are.
- The default pattern matches `password`, `passwd`, `secret`, `token`, `cookie`, `credential`, `api_key` / `api-key` / `apikey`, `authorization`, `proxy-authorization` and session ids.
- An empty pattern turns masking off. The panel hides headers with the same pattern.
- Response headers inside a non-oRPC backend's error data are masked too.
- SSR records replace sensitive headers with `***` on the server, before they reach the page ([SSR](./ssr.md)).
