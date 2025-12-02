const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OWNER = 'eonurk';
const REPO = 'StreamPS';
const VERSION = 'v0.1.0'; // Ensure this matches package.json or pass dynamically

if (!GITHUB_TOKEN) {
    console.error('Error: GITHUB_TOKEN environment variable is missing.');
    console.error('Please run: export GITHUB_TOKEN=your_token_here && node scripts/publish-release.js');
    process.exit(1);
}

const filesToUpload = [
    { name: 'StreamPS-0.1.0-arm64.dmg', path: 'dist/StreamPS-0.1.0-arm64.dmg', type: 'application/x-apple-diskimage' },
    { name: 'StreamPS-Setup-0.1.0.exe', path: 'dist/StreamPS-Setup-0.1.0.exe', type: 'application/vnd.microsoft.portable-executable' },
    { name: 'StreamPS-0.1.0.AppImage', path: 'dist/StreamPS-0.1.0.AppImage', type: 'application/x-executable' }
];

async function publish() {
    console.log(`Creating release ${VERSION} for ${OWNER}/${REPO}...`);

    // 1. Create Release
    const createReleaseRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases`, {
        method: 'POST',
        headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Content-Type': 'application/json',
            'User-Agent': 'StreamPS-Release-Script'
        },
        body: JSON.stringify({
            tag_name: VERSION,
            name: `StreamPS ${VERSION}`,
            body: 'Initial release for macOS, Windows, and Linux.',
            draft: false,
            prerelease: false
        })
    });

    if (!createReleaseRes.ok) {
        const err = await createReleaseRes.text();
        // If release already exists, we might want to find it, but for now just error out or check logic
        console.error('Failed to create release:', createReleaseRes.status, err);
        
        // Optional: Try to get existing release if it failed because it exists
        if (createReleaseRes.status === 422) {
            console.log('Release might already exist. Trying to fetch it...');
            const getReleaseRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/${VERSION}`, {
                 headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'User-Agent': 'StreamPS-Release-Script' }
            });
            if (getReleaseRes.ok) {
                const data = await getReleaseRes.json();
                return uploadAssets(data.upload_url, filesToUpload);
            }
        }
        return;
    }

    const releaseData = await createReleaseRes.json();
    console.log(`Release created: ${releaseData.html_url}`);
    
    await uploadAssets(releaseData.upload_url, filesToUpload);
}

async function uploadAssets(uploadUrlTemplate, files) {
    // upload_url comes like: https://uploads.github.com/repos/octocat/Hello-World/releases/1/assets{?name,label}
    const cleanUploadUrl = uploadUrlTemplate.split('{')[0];

    for (const file of files) {
        if (!fs.existsSync(file.path)) {
            console.warn(`Skipping ${file.name}: File not found at ${file.path}`);
            continue;
        }

        console.log(`Uploading ${file.name}...`);
        const stats = fs.statSync(file.path);
        const fileStream = fs.readFileSync(file.path); // Using sync read for simplicity in script

        const url = `${cleanUploadUrl}?name=${encodeURIComponent(file.name)}`;
        
        const uploadRes = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Content-Type': file.type,
                'Content-Length': stats.size,
                'User-Agent': 'StreamPS-Release-Script'
            },
            body: fileStream
        });

        if (uploadRes.ok) {
            console.log(`✓ ${file.name} uploaded successfully.`);
        } else {
            console.error(`✗ Failed to upload ${file.name}:`, await uploadRes.text());
        }
    }
    console.log('\nAll done! Release is live.');
}

publish().catch(err => console.error(err));
