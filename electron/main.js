const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const net = require('net');

const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_DEV === 'true' || !app.isPackaged;
const preferredPort = parseInt(process.env.PORT || '3000', 10);

let serverProcess = null;
let serverPort = preferredPort;

const findServerScript = () => {
    // 1. Production: Look in the "app-server" resource directory (created by electron-builder extraResources)
    const prodScript = path.join(process.resourcesPath, 'app-server', 'server.js');
    if (fs.existsSync(prodScript)) {
        return { script: prodScript, cwd: path.dirname(prodScript) };
    }

    // 2. Development: Look in .next/standalone in the current working directory
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

const startServer = async () => {
    if (isDev) {
        serverPort = preferredPort;
        return waitForServer(`http://localhost:${serverPort}`);
    }

    serverPort = await getAvailablePort(preferredPort);

    const resolved = findServerScript();
    if (!resolved) {
        throw new Error('Could not find Next standalone server.js in packaged app');
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
            HOSTNAME: '0.0.0.0',
            ...(packagedFfmpeg ? { FFMPEG_PATH: packagedFfmpeg } : {}),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProcess.stdout.on('data', (data) => {
        console.log(`[Next Server]: ${data}`);
    });

    serverProcess.stderr.on('data', (data) => {
        const str = data.toString();
        serverLogs += str;
        console.error(`[Next Server Error]: ${str}`);
    });

    return new Promise((resolve, reject) => {
        let resolvedOrRejected = false;

        const exitHandler = (code, signal) => {
            if (!resolvedOrRejected) {
                resolvedOrRejected = true;
                reject(new Error(`Next server exited prematurely with code ${code} (signal: ${signal}). Logs:\n${serverLogs}`));
            }
        };

        serverProcess.on('exit', exitHandler);

        waitForServer(`http://localhost:${serverPort}`)
            .then((url) => {
                if (!resolvedOrRejected) {
                    resolvedOrRejected = true;
                    // Remove the startup exit handler so we don't crash the main process if the server dies later (we can handle that separately if needed)
                    serverProcess.off('exit', exitHandler);
                    resolve(url);
                }
            })
            .catch((err) => {
                if (!resolvedOrRejected) {
                    resolvedOrRejected = true;
                    reject(new Error(`Server failed to start: ${err.message}. Logs:\n${serverLogs}`));
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

const createWindow = async () => {
    try {
        const packagedFfmpeg = getBundledFfmpegPath();

        // Pass FFMPEG_PATH to dev server environment if available
        if (isDev && packagedFfmpeg) {
            process.env.FFMPEG_PATH = packagedFfmpeg;
        }

        const serverUrl = await startServer();

        const win = new BrowserWindow({
            width: 1300,
            height: 800,
            backgroundColor: '#09090b',
            webPreferences: {
                contextIsolation: true,
            },
        });

        win.setMenuBarVisibility(false);
        await win.loadURL(serverUrl);
    } catch (error) {
        dialog.showErrorBox('Startup Error', `Failed to start application: ${error.message}`);
        app.quit();
    }
};

app.on('ready', createWindow);

app.on('window-all-closed', () => {
    stopServer();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', stopServer);

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
