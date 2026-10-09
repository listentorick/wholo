# Using web analytics (Plausible)

> Part of the [live-ops runbook](README.md). What it is and how it fits together: [overview.md](overview.md#web-analytics-plausible). Helm values and build flags: [setup/marketing-site.md](setup/marketing-site.md).

Plausible is the dashboard you look at. ClickHouse is only the database behind it; you never open or query ClickHouse yourself.

## Open the dashboard

Plausible has no public address. Reach it through a port-forward from a machine with `kubectl` access to live:

```bash
kubectl -n wholo port-forward svc/wholo-plausible 8000:8000
```

Leave that running and browse to `http://localhost:8000`.

## First time only

1. **Create the admin user.** The first visit to `http://localhost:8000` offers a registration form. After that first account, registration is invite-only (`plausible.disableRegistration: invite_only`). Store the login in the password manager.
2. **Add the site.** Enter the domain as `stocdup.com`, or whatever `WWW_PLAUSIBLE_DOMAIN` was set to at build time ([setup/github.md](setup/github.md)). It must match exactly: the site sends every event tagged with that name, and Plausible drops events for a site it doesn't know.
   - Skip the "add the snippet to your site" step. The marketing site already loads the script.
3. **Add the goals.** Custom events only appear on the dashboard once they are registered as goals. In the site's settings, under Goals, add a custom-event goal for each of these names:

   | Goal name | Sent when |
   |---|---|
   | `cta_click` | A visitor clicks a call-to-action button |
   | `form_start` | A visitor starts filling in the register form |
   | `form_submit` | The register form is submitted |
   | `form_success` | The registration was accepted |
   | `form_error` | The registration failed |

4. **Add the custom properties.** In the site's settings, under Custom properties, add `variant`, `section` and `code` so the dashboard can break goals down by them.

   | Property | On which events | Meaning |
   |---|---|---|
   | `section` | `cta_click` | Which page section the button was in |
   | `variant` | all `form_*` events | Which hero variant the visitor saw (the A/B split) |
   | `code` | `form_error` | The HTTP status, or `network` |

## What you can see

- **Visitors, pageviews, bounce rate and visit duration** over a chosen period.
- **Sources:** where visitors came from (search, links, direct).
- **Pages:** which pages were viewed, and entry and exit pages.
- **Locations and devices.**
- **Goal conversions:** how many visitors clicked a call to action or completed the register form. Click a goal to filter the whole dashboard to visitors who did it, and use the properties to compare hero variants.

## Check it is recording

1. Open `https://www.<domain>` in a normal browser window.
2. In the dashboard, the "current visitors" count at the top should go to 1 within a few seconds.

If it stays at 0:

- **`curl -sI https://www.<domain>/js/script.js` is not 200:** the `www` image was built without `WWW_PLAUSIBLE_ENABLED=1`, or `wholo-plausible` is down.
- **The script loads but nothing is counted:** the site name in Plausible does not match `WWW_PLAUSIBLE_DOMAIN`.
- **Pods:** `kubectl -n wholo get deploy wholo-plausible wholo-clickhouse` should show both as 1/1.

## Give someone else access

Registration is invite-only. Invite them from the site's settings, under People. Plausible has no outbound email configured, so copy the invitation link from that page and send it yourself; they still need the port-forward to open it.
