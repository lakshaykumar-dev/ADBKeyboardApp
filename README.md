# 📱 ADB Remote Keyboard & Trackpad for Laptop

Turn your Android smartphone into an ultra-low latency hardware PC keyboard, touchpad, voice-typing dictation pad, and shortcut controller for your Windows laptop over USB (via ADB) or Wi-Fi.

[![Release](https://img.shields.io/badge/Release-v1.0-blue.svg)](https://github.com/lakshaykumar-dev/ADBKeyboardApp/releases/tag/v1.0)
[![Platform](https://img.shields.io/badge/Platform-Android%20%7C%20Windows-brightgreen.svg)]()
[![License](https://img.shields.io/badge/License-MIT-purple.svg)]()

---

## 📥 Downloads (Latest Release v1.0)

| File | Description | Download Link |
|---|---|---|
| 🖥️ **Windows Companion App** | Standalone `.exe` GUI (No Python / No Terminal required) | [**Download ADBKeyboardCompanion.exe**](https://github.com/lakshaykumar-dev/ADBKeyboardApp/releases/download/v1.0/ADBKeyboardCompanion.exe) |
| 📱 **Android Mobile App** | Standalone `.apk` (Hermes pre-bundled) | [**Download ADBKeyboard-v1.0.apk**](https://github.com/lakshaykumar-dev/ADBKeyboardApp/releases/download/v1.0/ADBKeyboard-v1.0.apk) |

---

## ⚡ How It Works

When your phone is connected to your Windows laptop with USB debugging enabled, the app uses **ADB reverse port forwarding**:
```bash
adb reverse tcp:8080 tcp:8080
```
This routes TCP network traffic between `localhost:8080` on the Android phone directly through the physical USB cable into the laptop with **sub-millisecond latency (5–10ms)**.
- ⚡ **Zero Wi-Fi or Internet required**
- 🔒 **Completely offline, private, and secure**
- 🎮 **Ideal for coding, typing, gaming, and remote presentation control**

---

## 🚀 Quick Setup Guide (For Users)

### Step 1: Enable USB Debugging on your Android Phone
1. Open your phone's **Settings** ➔ **About Phone**.
2. Tap **Build Number** 7 times until you see *"You are now a developer!"*.
3. Go back to **Settings** ➔ **System / Developer Options**.
4. Turn on **USB Debugging** (and allow USB debugging prompt when connected).

### Step 2: Install Mobile App on your Phone
1. Download [**`ADBKeyboard-v1.0.apk`**](https://github.com/lakshaykumar-dev/ADBKeyboardApp/releases/download/v1.0/ADBKeyboard-v1.0.apk) on your phone.
2. Tap the APK to install (allow install from unknown sources if prompted).
   *(Or install via computer terminal: `adb install ADBKeyboard-v1.0.apk`)*

### Step 3: Run Companion App on Laptop
1. Plug your phone into your laptop via USB cable.
2. Download and double-click [**`ADBKeyboardCompanion.exe`**](https://github.com/lakshaykumar-dev/ADBKeyboardApp/releases/download/v1.0/ADBKeyboardCompanion.exe) on your laptop.
3. The companion GUI will open and automatically:
   - Detect your connected phone (`🟢 ADB Device: Connected`)
   - Forward port 8080 via ADB reverse
   - Show a live stream of keystrokes and connected status

### Step 4: Start Typing!
1. Open the **ADB Keyboard** app on your phone.
2. The header badge will turn **🟢 ONLINE (5-10ms)**.
3. Click anywhere on your laptop (Notepad, VS Code, Browser, Word) and tap on your phone to type immediately!

---

## 💻 Developer Setup (Building From Source)

If you want to modify or build the project from source code:

### Prerequisites:
- **Node.js** (v20+ recommended)
- **Android Studio / Android SDK** (with `ANDROID_HOME` configured)
- **JDK 17** (with `JAVA_HOME` configured)
- **Python 3.10+** (with `pip`)
- **ADB** (in your system PATH)

### 1. Clone Repository & Install Dependencies
```bash
git clone https://github.com/lakshaykumar-dev/ADBKeyboardApp.git
cd ADBKeyboardApp
npm install
```

### 2. Install Python Companion Server Dependencies
```bash
pip install pyautogui pyperclip websockets pyinstaller
```

### 3. Run Development Server
```bash
# Terminal 1 - Start Companion GUI on laptop:
python server/companion_gui.py

# Terminal 2 - Run Android app on connected device:
npm run android
```

### 4. Build Standalone Production Release APK
```bash
cd android
./gradlew assembleRelease
# The standalone APK will be created at:
# android/app/build/outputs/apk/release/app-release.apk
```

### 5. Build Desktop Companion `.exe`
```bash
python -m PyInstaller --onefile --noconsole --name "ADBKeyboardCompanion" server/companion_gui.py
# The standalone .exe will be created in the dist/ folder
```

---

## 🎮 Features & Modes

### 1. ⌨️ Full PC Mechanical Keyboard
- Complete QWERTY keyboard with mechanical click feel & haptic feedback.
- Function row: `Esc`, `F1`–`F12`, `Del`, `PrtScn`.
- Sticky Modifier Toggles: Tap `Ctrl`, `Alt`, `Shift`, or `Win` to hold them active, then tap any key for combinations.
- Dedicated Arrow Navigation Keys (`▲`, `▼`, `◀`, `▶`), `Home`, `End`, `Page Up`, `Page Down`, `Insert`.
- Dedicated **Numeric Keypad (Numpad)** with `NumLock`, numbers, arithmetic operators (`+`, `-`, `*`, `/`), and `Enter`.

### 2. 📝 Native Typing & Voice Dictation (`Text / Voice` tab)
- Use your phone's native keyboard (Gboard, Samsung Keyboard, SwiftKey).
- **Voice Typing**: Tap your phone's microphone icon to dictate entire paragraphs directly into your laptop!
- **Buffer / Paste Mode**: Paste long code snippets or text drafts on your phone, then tap `➤ Send Text` or `↵ Send + Enter`.
- **Live Stream Mode**: Toggle `Live Stream: ON` to stream characters in real-time as you type or swipe.
- Quick command chips (`git status`, `npm run start`, `cls`, etc.).

### 3. ⚡ One-Tap Shortcuts (`Shortcuts` tab)
- **Clipboard & Editing**:
  - `Win + V` — Windows Clipboard History
  - `Ctrl + C` — Copy
  - `Ctrl + V` — Paste
  - `Ctrl + X` — Cut
  - `Ctrl + A` — Select All
  - `Ctrl + Z` — Undo
  - `Ctrl + Y` — Redo
  - `Ctrl + S` — Save
  - `Ctrl + F` — Find
- **Windows Navigation**:
  - `Win + D` — Show Desktop
  - `Win + E` — File Explorer
  - `Win + R` — Run Dialog
  - `Win + L` — Lock Laptop
  - `Alt + Tab` — Switch Application
  - `Alt + F4` — Close Active Window
  - `Ctrl + Shift + Esc` — Task Manager
  - `Ctrl + T` — New Tab
  - `Ctrl + W` — Close Tab
- **Media Controls**:
  - Volume Up (`🔊`), Volume Down (`🔉`), Mute (`🔇`), Play/Pause (`⏯`), Next (`⏭`), Prev (`⏮`).

### 4. 🖱️ Laptop Trackpad (`Trackpad` tab)
- Smooth touchpad area to control your laptop mouse cursor with natural finger swipes.
- Tap to Left-Click.
- Hardware mouse buttons: `LEFT CLICK`, `SCROLL CLICK`, `RIGHT CLICK`.
- Scroll Up and Scroll Down buttons.

---

## 📡 Wireless (Wi-Fi) Mode (Alternative)

If you don't have a USB cable:
1. Ensure your laptop and phone are connected to the same Wi-Fi network.
2. Open `ADBKeyboardCompanion.exe` on your laptop and check the displayed Wi-Fi IP (e.g. `192.168.1.15:8080`).
3. Open the **ADB Keyboard** app on your phone, tap the **⚙️ Settings** icon in the header, enter your laptop's Wi-Fi IP address, and tap **Save & Connect**.

---

## ❓ Troubleshooting FAQ

#### Q: The app badge shows "OFFLINE"?
1. Verify your phone is connected with USB Debugging enabled.
2. In the Windows companion app, click **"Sync ADB Reverse"**.
3. If using Wi-Fi mode, ensure both devices are on the same Wi-Fi network and firewall allows port 8080.
4. The app features an automatic 2-second reconnect loop and will automatically connect once port 8080 is reached.

#### Q: Keystrokes are not appearing on my laptop?
Click your mouse into the application window on your laptop (e.g. Notepad or browser search bar) so it has active typing focus.

#### Q: "ADB device not detected"?
Make sure your phone screen is unlocked and you accepted the prompt: *"Allow USB debugging from this computer?"*.

---

## 📄 License
This project is open source under the MIT License.
