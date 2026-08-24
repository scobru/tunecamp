# Instance Setup Wizard

The setup wizard configures what an instance *is*: which modules it exposes, whether strangers can register, and how the site introduces itself. It lives in **Admin → Setup** and is visible to the Instance Owner (root admin) only.

::: tip Two different wizards
This page is about the **instance** wizard in the admin panel. The one that appears at first login and forces a password change is a different thing — see [First Login: Setup Wizard](./ROLES.md#first-login-setup-wizard).
:::

It is not a first-run-only flow. You can re-run it at any time, and doing so **overwrites** the module flags with the ones from the profile you pick. Anything you set by hand in Admin Settings afterwards wins until the next run.

## The four steps

1. **Profile** — pick one of the six presets below. Each is a bundle of module flags plus a site mode.
2. **Modules** — the preset's flags, shown as toggles. Change any of them before continuing; the preset is a starting point, not a cage.
3. **Identity** — site name and description, pre-filled with a template for the chosen profile.
4. **Done** — a short list of suggested next steps for that profile.

Step 3 writes every flag in one `POST` to the settings endpoint together with `instanceProfile`, `siteName`, `siteDescription` and `mode`, then refreshes the cached frontend settings.

## Profiles

`mode` decides the shape of the homepage (`single_artist`, `label`, `community`). The `hide*` flags remove sections from the navigation and refuse their API routes for non-admins.

| Profile | Mode | Store | Social | Network | Dig | Live | Samples | Collab | Lab | Public registration | Listener self-publish |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Solo Artist** | `single_artist` | ✅ | ✅ | — | — | — | — | — | — | — | — |
| **Record Label** | `label` | ✅ | ✅ | ✅ | — | — | — | — | — | ✅ | — |
| **Music Curator** | `community` | — | ✅ | ✅ | ✅ | — | — | — | — | ✅ | ✅ |
| **Web Radio / Streamer** | `community` | — | ✅ | — | ✅ | ✅ | — | — | — | ✅ | — |
| **Sound Designer** | `community` | — | ✅ | — | — | — | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Listening Room** | `community` | — | ✅ | ✅ | — | — | — | — | — | ✅ | — |

✅ = the module is on for that profile. A dash means the corresponding `hide*` flag is set.

"Social" is the Fediverse feed (`/social`, flag `hideSocial`) — **not** the message board. The board has its own setting, `boardEnabled`, which the wizard does not touch and which is off unless you enable it in Admin Settings.

- **Solo Artist** — a portfolio: your releases, direct sales, Fediverse presence. Community surfaces are off.
- **Record Label** — a roster: artist profiles, catalog, central store, network discovery on.
- **Music Curator** — playlists and discovery: Dig for external sources, social feed on, listeners may self-publish.
- **Web Radio / Streamer** — live broadcasting: the Live module and Dig on, store off.
- **Sound Designer** — free sample packs: Samples, Collab and Lab on, listeners may self-publish.
- **Listening Room** — listening together: the shared library, Sidecamp folder sharing and the social feed, with everything else stripped out.

## Changing your mind

Every flag the wizard writes is also a toggle in **Admin → Settings**, so you never have to re-run the wizard to change one thing. Re-run it when you want to move an instance from one shape to another wholesale — from a solo portfolio to a label, say — and accept that it will reset the flags it owns.

`instanceProfile` is stored with the settings, so the instance remembers which profile it was set up as.
