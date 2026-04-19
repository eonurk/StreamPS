const { app, BrowserWindow, dialog, Tray, Menu, nativeImage, ipcMain, shell, Notification } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const net = require('net');

const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_DEV === 'true' || !app.isPackaged;
const preferredPort = parseInt(process.env.PORT || '3000', 10);

let serverProcess = null;
let serverPort = preferredPort;
let serverUrl = null;
let mainWindow = null;
let tray = null;
let isQuitting = false;
let isStreaming = false;

// ─── Single instance ──────────────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
    process.exit(0);
}

app.on('second-instance', () => {
    if (mainWindow) {
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.focus();
    }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const findServerScript = () => {
    const prodScript = path.join(process.resourcesPath, 'app-server', 'server.js');
    if (fs.existsSync(prodScript)) {
        return { script: prodScript, cwd: path.dirname(prodScript) };
    }
    const devScript = path.join(process.cwd(), '.next', 'standalone', 'server.js');
    if (fs.existsSync(devScript)) {
        return { script: devScript, cwd: path.dirname(devScript) };
    }
    return null;
};

const getBundledFfmpegPath = () => {
    const platform = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux';
    const exe = platform === 'win' ? 'ffmpeg.exe' : 'ffmpeg';
    const candidate = isDev
        ? path.join(__dirname, '..', 'resources', 'ffmpeg', platform, exe)
        : path.join(process.resourcesPath, 'ffmpeg', platform, exe);
    return fs.existsSync(candidate) ? candidate : null;
};

const waitForServer = (url, retries = 50, interval = 200) =>
    new Promise((resolve, reject) => {
        const attempt = (remaining) => {
            const req = http.request(url, { method: 'GET' }, (res) => {
                res.destroy();
                resolve(url);
            });
            req.on('error', () => {
                if (remaining <= 0) {
                    reject(new Error(`Server did not start at ${url}`));
                } else {
                    setTimeout(() => attempt(remaining - 1), interval);
                }
            });
            req.end();
        };
        attempt(retries);
    });

const getAvailablePort = (startPort) =>
    new Promise((resolve) => {
        const tryPort = (port) => {
            const srv = net.createServer();
            srv.unref();
            srv.on('error', () => tryPort(port + 1));
            srv.listen(port, () => {
                const { port: bound } = srv.address();
                srv.close(() => resolve(bound));
            });
        };
        tryPort(startPort);
    });

// ─── Server ───────────────────────────────────────────────────────────────────

const startServer = async () => {
    if (isDev) {
        serverPort = preferredPort;
        const url = `http://localhost:${serverPort}`;
        await waitForServer(url);
        return url;
    }

    serverPort = await getAvailablePort(preferredPort);

    const resolved = findServerScript();
    if (!resolved) {
        throw new Error(
            'Could not find the Next.js server.\n\n' +
            'Run "npm run build" first, then "npm run electron:build".'
        );
    }

    const { script: serverScript, cwd } = resolved;
    const packagedFfmpeg = getBundledFfmpegPath();
    let serverLogs = '';

    serverProcess = spawn(process.execPath, [serverScript], {
        cwd,
        env: {
            ...process.env,
            NODE_ENV: 'production',
            ELECTRON_RUN_AS_NODE: '1',
            PORT: serverPort.toString(),
            HOSTNAME: '127.0.0.1',
            ...(packagedFfmpeg ? { FFMPEG_PATH: packagedFfmpeg } : {}),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProcess.stdout.on('data', (d) => console.log(`[Server] ${d}`));
    serverProcess.stderr.on('data', (d) => {
        const str = d.toString();
        serverLogs += str;
        console.error(`[Server] ${str}`);
    });

    return new Promise((resolve, reject) => {
        let settled = false;

        const onExit = (code, signal) => {
            if (!settled) {
                settled = true;
                reject(new Error(`Server exited prematurely (code ${code}, signal ${signal}).\n\n${serverLogs}`));
            }
        };

        serverProcess.on('exit', onExit);

        waitForServer(`http://127.0.0.1:${serverPort}`)
            .then((url) => {
                if (!settled) {
                    settled = true;
                    serverProcess.off('exit', onExit);
                    resolve(url);
                }
            })
            .catch((err) => {
                if (!settled) {
                    settled = true;
                    reject(new Error(`${err.message}\n\n${serverLogs}`));
                }
            });
    });
};

const stopServer = () => {
    if (serverProcess) {
        serverProcess.kill('SIGTERM');
        serverProcess = null;
    }
};

// ─── Tray ─────────────────────────────────────────────────────────────────────

const updateTrayMenu = () => {
    if (!tray) return;

    const menu = Menu.buildFromTemplate([
        { label: 'StreamPS', enabled: false },
        { type: 'separator' },
        { label: isStreaming ? '● Relay Active' : '○ Standby', enabled: false },
        { type: 'separator' },
        {
            label: 'Show Window',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
            },
        },
        { type: 'separator' },
        {
            label: 'Quit StreamPS',
            click: () => {
                isQuitting = true;
                app.quit();
            },
        },
    ]);

    tray.setContextMenu(menu);
    tray.setToolTip(isStreaming ? 'StreamPS — Relay Active' : 'StreamPS — Standby');
};

const createTray = () => {
    const candidates = [
        isDev
            ? path.join(__dirname, '..', 'resources', 'icon-tray.png')
            : path.join(process.resourcesPath, 'icon-tray.png'),
    ];

    let icon = nativeImage.createEmpty();
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            icon = nativeImage.createFromPath(p);
            break;
        }
    }

    if (process.platform === 'darwin' && !icon.isEmpty()) {
        icon.setTemplateImage(true);
    }

    try {
        tray = new Tray(icon);
        updateTrayMenu();

        tray.on('click', () => {
            if (mainWindow) {
                mainWindow.isVisible() ? mainWindow.focus() : mainWindow.show();
            }
        });
    } catch (e) {
        console.warn('[Tray] Could not create tray:', e.message);
    }
};

// ─── Window ───────────────────────────────────────────────────────────────────

const createWindow = () => {
    const preloadPath = path.join(__dirname, 'preload.js');
    const loadingPath = path.join(__dirname, 'loading.html');

    mainWindow = new BrowserWindow({
        width: 1300,
        height: 820,
        minWidth: 960,
        minHeight: 620,
        backgroundColor: '#09090b',
        titleBarStyle: 'default',
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: fs.existsSync(preloadPath) ? preloadPath : undefined,
        },
        show: false,
    });

    mainWindow.setMenuBarVisibility(false);
    if (process.platform !== 'darwin') {
        mainWindow.removeMenu();
    }

    if (fs.existsSync(loadingPath)) {
        mainWindow.loadFile(loadingPath).catch(() => {});
    }

    mainWindow.once('ready-to-show', () => mainWindow.show());

    // Hide to tray on close — keeps the relay alive in the background
    mainWindow.on('close', (e) => {
        if (!isQuitting) {
            e.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
};

// ─── IPC ──────────────────────────────────────────────────────────────────────

ipcMain.on('set-stream-status', (_, active) => {
    isStreaming = !!active;
    updateTrayMenu();

    if (Notification.isSupported()) {
        new Notification({
            title: active ? 'Relay Started' : 'Relay Stopped',
            body: active
                ? 'Your stream is now live on Kick.'
                : 'Your Kick relay has been stopped.',
            silent: true,
        }).show();
    }
});

ipcMain.on('open-external', (_, url) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) {
        shell.openExternal(url);
    }
});

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.on('ready', async () => {
    app.setName('StreamPS');

    createTray();
    createWindow();

    if (isDev) {
        const bundled = getBundledFfmpegPath();
        if (bundled) process.env.FFMPEG_PATH = bundled;
    }

    try {
        serverUrl = await startServer();
        if (mainWindow && !mainWindow.isDestroyed()) {
            await mainWindow.loadURL(serverUrl);
            mainWindow.focus();
        }
    } catch (error) {
        dialog.showErrorBox('StreamPS — Startup Error', `Could not start the application:\n\n${error.message}`);
        app.quit();
    }
});

// macOS: clicking dock icon re-shows the window without restarting the server
app.on('activate', () => {
    if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
    } else if (serverUrl) {
        createWindow();
        mainWindow.loadURL(serverUrl).catch(() => {});
    }
});

// Keep running in system tray when window is closed
app.on('window-all-closed', () => {
    if (!tray && process.platform !== 'darwin') {
        stopServer();
        app.quit();
    }
});

app.on('before-quit', () => {
    isQuitting = true;
    stopServer();
});
