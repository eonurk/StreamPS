# StreamPS

Currently, there is no native way to stream from PS5 to [Kick.com](https://kick.com). This dashboard allows you to broadcast your Twitch stream to Kick.

1. Start a Twitch stream on PS5
2. Run the dashboard on local (npm run dev), which starts a webpage at https://localhost:3000
3. Enter your Twitch / Kick usernames, and Kick Stream Key (Channel > Stream URL & Key)
4. It automatically starts your Kick Stream!


![App Dashboard Preview](/APP_DASHBOARD.png)

## Desktop App (Electron)

You can run StreamPS as a downloadable desktop app (Electron) so users do not need Node on their machines. FFmpeg must be on the system PATH.

**Dev (hot reload UI):**
```bash
npm install
npm run electron:dev
```

**Build installer:**
```bash
npm run electron:build
```
This runs `next build`, then packages the app. Outputs live in `dist/` (DMG for macOS, NSIS for Windows, AppImage for Linux).

### Publishing Releases to GitHub

To publish the generated desktop application artifacts (DMG, EXE, AppImage) to GitHub Releases, use the provided script:

```bash
export GITHUB_TOKEN=your_github_token_here
node scripts/publish-release.js
```

**Note:** Replace `your_github_token_here` with a GitHub Personal Access Token that has `repo` scope. The script will create a new release or update an existing one for the version specified in `scripts/publish-release.js` (or `package.json`).

### Bundled FFmpeg (no install for users)

Drop a static ffmpeg binary into the matching folder:
- `resources/ffmpeg/mac/ffmpeg` (chmod +x)
- `resources/ffmpeg/win/ffmpeg.exe`
- `resources/ffmpeg/linux/ffmpeg` (chmod +x)

When you run `npm run electron:build`, only the binary for the target OS is bundled (config uses `${os}`), so installers stay smaller. If a binary is missing, the app falls back to system ffmpeg on PATH.
If you do not bundle ffmpeg, users must install it themselves.


## Getting Started

First, run the development server:

```bash
npm install

npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev


Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
