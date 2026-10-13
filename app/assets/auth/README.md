# Sign-in artwork

Downloaded from the providers on 2026-10-13 (UTC). These assets are used only on their respective sign-in buttons. Authentication continues through the existing native form and Better Auth.

- `google-g.png`: the standard gradient G from [Google's branding guidance](https://developers.google.com/identity/branding-guidelines), [original asset](https://developers.google.com/static/identity/images/g-logo.png). Preserve its aspect ratio and colors.
- `google-sans-medium.ttf`: Google Sans Medium from the [Google Fonts stylesheet](https://fonts.googleapis.com/css2?family=Google+Sans:wght@500&display=swap&text=Continue%20with%20Google), using Google's `text` subset for “Continue with Google” (4 KB), self-hosted under the accompanying `GoogleSans-OFL.txt` license. Request a new subset if the button copy changes.
- `apple-continue-black.png` and `apple-continue-white.png`: unmodified images from [Apple's button image service](https://developer.apple.com/documentation/signinwithapplerestapi/get-a-sign-in-with-apple-button-that-is-center-aligned.). Parameters: `type=continue`, `color=black` or `white`, `border=false`, `border_radius=0`, `width=240`, `height=48`, `scale=3`, `locale=en_US`. Centered inside the matching full-width button background; no third-party request is made at runtime.

Both buttons are 48px tall and full width. Google uses the provider's light/dark colors and 14px Medium type. Apple uses black in light mode and white in dark mode, with the logo and text rendered by Apple. See [Apple's button guidance](https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple).
