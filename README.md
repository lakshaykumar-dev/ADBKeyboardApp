# 📱 ADB Remote Keyboard & Trackpad for Laptop

A high-performance, ultra-low latency mobile keyboard and touchpad for your Windows laptop powered by **React Native** and **ADB (Android Debug Bridge)** over USB or Wi-Fi.

---

## ⚡ How It Works

1. **Direct USB Tunnel (Sub-millisecond Latency)**:
   When your phone is connected to your laptop with USB Debugging enabled, the command:
   ```bash
   adb reverse tcp:8080 tcp:8080
   ```
   tunnels connections from `localhost:8080` on your mobile phone directly through the USB cable into the laptop's companion server on port `8080`.
   - **Zero Wi-Fi or Internet required**
   - **Offline, private, and ultra-responsive**

2. **Laptop Companion Server**:
   A lightweight, zero-dependency Windows companion server (`server/companion_server.py`) receives real-time keyboard events, text streams, and touchpad gestures over WebSocket and simulates hardware inputs directly into Windows using the native `user32.dll` API.

---

## 🚀 Quick Start Guide

### Step 1: Start Companion App on Laptop
Simply double-click the standalone Desktop GUI app:
```
ADBKeyboardCompanion.exe
```
*(No Python or terminal required! It shows live ADB connection status, mobile client status, and real-time keystroke stream)*

Alternatively, you can also run:
```cmd
start-companion.bat
```

This script automatically:
- Verifies your connected device via `adb devices`
- Configures port forwarding via `adb reverse tcp:8080 tcp:8080`
- Starts the WebSocket input bridge on port `8080`

### Step 2: Install and Run App on Your Phone
With your phone connected via USB:
```bash
# In the ADBKeyboardApp directory:
npm run android
```
Or directly install the built APK:
```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

### Step 3: Start Typing!
Open the **ADB Keyboard** app on your phone.
- The status pill in the top header will immediately turn **ONLINE (0-2ms)**.
- Tap any key on your phone to type directly into whatever active application (Notepad, VS Code, Browser, Terminal, Games) is open on your laptop!

---

## 🎮 Features & Modes

### 1. ⌨️ Full PC Mechanical Keyboard
- Complete PC keyboard layout with mechanical sound/vibration feedback.
- Dedicated Function row (`Esc`, `F1` - `F12`, `Del`, `PrtScn`).
- Full QWERTY keys with numbers, symbols, `Tab`, `Caps`, `Enter`, `Backspace`.
- **Hardware Modifier Toggles**: Tap `Ctrl`, `Alt`, `Shift`, or `Win` to hold them active, then press any key or combination!
- Dedicated Directional Arrow Keys (`▲`, `▼`, `◀`, `▶`) and Navigation keys (`Home`, `End`, `PgUp`, `PgDn`, `Insert`).

### 2. 📝 Native Typing, Voice & Text Buffer
- Use your phone's native keyboard (Gboard, Samsung Keyboard, SwiftKey).
- **Voice-to-Text Support**: Speak into your phone microphone and transmit full sentences to your laptop!
- **Live Stream Mode**: Characters sent immediately as typed or swiped.
- **Buffer / Paste Mode**: Paste long snippets or write full drafts on mobile, then tap `➤ Send Text` or `↵ Send + Enter`.
- **Quick Inserts**: One-tap buttons for common terminal commands (`git status`, `npm run start`, `cls`, etc.).

### 3. ⚡ Quick Shortcuts Toolbar
Instant one-tap execution of essential Windows & Productivity shortcuts:
- **Editing**: Select All (`Ctrl+A`), Copy (`Ctrl+C`), Paste (`Ctrl+V`), Cut (`Ctrl+X`), Undo (`Ctrl+Z`), Redo (`Ctrl+Y`), Save (`Ctrl+S`), Find (`Ctrl+F`).
- **Windows Navigation**: Show Desktop (`Win+D`), File Explorer (`Win+E`), Run Dialog (`Win+R`), App Switcher (`Alt+Tab`), Close Window (`Alt+F4`), Task Manager (`Ctrl+Shift+Esc`), New Tab (`Ctrl+T`), Close Tab (`Ctrl+W`).
- **Media Controls**: Volume Up, Volume Down, Mute, Play/Pause, Next Track, Previous Track.

### 4. 🖱️ Laptop Touchpad / Mouse Mode
- Smooth touchpad surface for moving the mouse cursor with natural touch gestures.
- Tap to Left-Click.
- Hardware mouse buttons: `Left Click`, `Middle Click`, and `Right Click`.
- Quick Scroll Up / Scroll Down buttons.

---

## 🛠️ Connectivity Modes

| Mode | Connection | Setup | Best For |
|---|---|---|---|
| **USB ADB (Recommended)** | USB Cable | `adb reverse tcp:8080 tcp:8080` (automated) | Gaming, coding, zero lag, no Wi-Fi needed |
| **Wi-Fi LAN** | Same Wi-Fi Network | Enter Laptop IP in App Settings (e.g. `192.168.1.15:8080`) | Wireless freedom across the room |

---

## 🔧 Project Structure

```
ADBKeyboardApp/
├── android/                   # Native Android project configuration
├── server/
│   └── companion_server.py    # Windows companion bridge (WebSocket + user32 ctypes)
├── start-companion.bat        # 1-click ADB reverse + Server starter
├── App.tsx                    # Complete React Native mobile keyboard application
├── package.json               # NPM scripts and dependencies
└── README.md                  # Complete documentation
```

---

## ❓ Troubleshooting

- **Phone shows "OFFLINE"**:
  1. Make sure USB Debugging is ON in phone Developer Options.
  2. Run `adb devices` in terminal to confirm your phone is recognized.
  3. Run `adb reverse tcp:8080 tcp:8080`.
  4. Ensure `start-companion.bat` is running on your laptop.
- **Keystrokes not registering in an app**:
  Make sure you click to focus the desired text field or window on your laptop before typing.
