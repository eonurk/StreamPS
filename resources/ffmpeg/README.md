Place platform-specific static ffmpeg binaries here before building:

- mac: `resources/ffmpeg/mac/ffmpeg` (chmod +x)
- win: `resources/ffmpeg/win/ffmpeg.exe`
- linux: `resources/ffmpeg/linux/ffmpeg` (chmod +x)

These files are bundled into the app and set as `FFMPEG_PATH` at runtime. If missing, the app falls back to the system ffmpeg on PATH.
