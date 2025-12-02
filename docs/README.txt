# StreamPS Website

This folder contains the static website for StreamPS.

## How to Deploy to GitHub Pages

1.  **Update Links:** Open `index.html` and replace `YOUR_USER` with your actual GitHub username in all `href` attributes (GitHub links and Download links).
2.  **Push to GitHub:** Commit and push this directory to your repository.
3.  **Enable Pages:**
    *   Go to your repository on GitHub.
    *   Navigate to **Settings** > **Pages**.
    *   Under **Build and deployment**, select **Source: Deploy from a branch**.
    *   Select your main branch and the `/docs` folder.
    *   Click **Save**.

## Downloads
The download buttons are configured to look for files in your repository's "Releases" section. You will need to create a Release in GitHub and upload the `dmg`, `exe`, and `AppImage` files generated in your `dist/` folder.
