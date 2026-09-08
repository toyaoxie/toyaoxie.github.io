# Content Studio — setup guide

This is a **client-side static CMS**. There is no server behind `/admin/` —
it's a page of JavaScript that talks directly to GitHub's API from your
browser, using a personal access token you create once. That's the same
approach tools like Decap CMS use; it's the only way to get "no-code
publishing" out of a GitHub Pages site, since GitHub Pages itself can't run
any server-side code.

## First-time setup

1. Go to https://github.com/settings/personal-access-tokens/new
2. Give it a name like "Yao site CMS"
3. **Resource owner:** your account
4. **Repository access:** "Only select repositories" → `toyaoxie.github.io`
5. **Permissions → Repository permissions → Contents:** set to **Read and write**
   (leave everything else as "No access")
6. Generate the token, copy it
7. Open `/admin/` on your live site, paste the token in when asked

## Security — please read this once

That token is equivalent to a password for this one repository. Anyone who
has it can publish to your site. A few rules:

- It's stored **only** in the browser you set it up in (`localStorage`) —
  it is never sent anywhere except `api.github.com`.
- Don't open `/admin/` and enter your token on a shared or public computer.
- If you ever lose a device that has it saved, revoke the token immediately
  from https://github.com/settings/tokens — that instantly cuts off access
  without touching your GitHub password.
- The token above is scoped to *only* this one repository, so even if it
  leaked, nothing else on your GitHub account is exposed.

## How content actually gets published

- All content lives in `/content/*.json` — News, Projects, Initiatives,
  Publications, and homepage settings.
- Every News/Project/Initiative page on the live site
  (`/news/<slug>/`, `/projects/<slug>/`, `/initiatives/<slug>/`) is the
  *exact same generic HTML file* — it has no content baked in. It reads
  its own slug from the URL, fetches the matching JSON, and renders it.
  This is why adding a new one doesn't require writing any HTML: the admin
  panel just needs to add one entry to the JSON, and copy the generic
  template into a new folder if that page doesn't exist yet.
- Draft items are saved to the JSON with `"status": "draft"` but have no
  live page yet — nothing is created until you hit **Publish**.
- Archiving never deletes anything — it just flips the status so the item
  drops off the public site while staying in the dashboard, reversible any time.

## What's built (v1) vs. deferred

**Built:** News/Projects/Initiatives/Publications CRUD, Draft → Published →
Archived, true-template Preview, image upload with client-side resize,
Homepage hero + featured content control, Media library, Duplicate, Quick Add.

**Deliberately deferred** (per the P2 list — build only if it turns out to
be needed): scheduled publishing, AI-assisted drafting, natural-language
updates, analytics. The data model (`content/*.json` + one template per
kind) was designed so none of these require restructuring anything later —
they'd all be additive.
