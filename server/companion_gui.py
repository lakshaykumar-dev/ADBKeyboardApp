"""
ADB Remote Keyboard Companion GUI for Windows
Standalone Desktop Application with real-time UI showing ADB status,
connected mobile client device, keystroke activity feed, and one-click controls.
"""

import sys
import os
import json
import socket
import asyncio
import threading
import subprocess
import time
from datetime import datetime
import tkinter as tk
from tkinter import ttk, scrolledtext
import pyautogui
import pyperclip

# Configure PyAutoGUI
pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0.001

# Map keys to PyAutoGUI key names
PYAUTOGUI_KEY_MAP = {
    'escape': 'esc',
    'esc': 'esc',
    'enter': 'enter',
    'return': 'enter',
    'backspace': 'backspace',
    'tab': 'tab',
    'space': 'space',
    'capslock': 'capslock',
    'caps': 'capslock',
    'shift': 'shift',
    'ctrl': 'ctrl',
    'control': 'ctrl',
    'alt': 'alt',
    'win': 'win',
    'super': 'win',
    'windows': 'win',
    'delete': 'delete',
    'del': 'delete',
    'insert': 'insert',
    'ins': 'insert',
    'home': 'home',
    'end': 'end',
    'pageup': 'pageup',
    'pagedown': 'pagedown',
    'up': 'up',
    'down': 'down',
    'left': 'left',
    'right': 'right',
    'printscreen': 'printscreen',
    'prtsc': 'printscreen',
    'numlock': 'numlock',
    'volumemute': 'volumemute',
    'volumedown': 'volumedown',
    'volumeup': 'volumeup',
    'mediaprev': 'prevtrack',
    'mediaplaypause': 'playpause',
    'medianext': 'nexttrack',
    'f1': 'f1',
    'f2': 'f2',
    'f3': 'f3',
    'f4': 'f4',
    'f5': 'f5',
    'f6': 'f6',
    'f7': 'f7',
    'f8': 'f8',
    'f9': 'f9',
    'f10': 'f10',
    'f11': 'f11',
    'f12': 'f12',
}

def normalize_key(k: str) -> str:
    k_lower = k.lower().strip()
    return PYAUTOGUI_KEY_MAP.get(k_lower, k)

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'

class CompanionApp:
    def __init__(self, root):
        self.root = root
        self.root.title("ADB Remote Keyboard - Companion")
        self.root.geometry("640x620")
        self.root.minsize(580, 520)
        self.root.configure(bg="#0b1120")

        self.port = 8080
        self.local_ip = get_local_ip()
        self.adb_device = None
        self.client_connected = False
        self.client_ip = None
        self.auto_scroll = True
        self.total_keystrokes = 0

        self.setup_ui()

        # Start ADB Background Monitor
        self.adb_thread = threading.Thread(target=self.adb_monitor_loop, daemon=True)
        self.adb_thread.start()

        # Start WebSocket Server in asyncio thread
        self.server_thread = threading.Thread(target=self.start_websocket_server, daemon=True)
        self.server_thread.start()

    def setup_ui(self):
        # Header Frame
        header = tk.Frame(self.root, bg="#0f172a", pady=12, padx=16)
        header.pack(fill="x")

        title_lbl = tk.Label(
            header,
            text="⚡ ADB REMOTE KEYBOARD COMPANION",
            font=("Segoe UI", 14, "bold"),
            fg="#38bdf8",
            bg="#0f172a"
        )
        title_lbl.pack(anchor="w")

        sub_lbl = tk.Label(
            header,
            text="Mobile to Laptop Hardware Input Bridge (USB & Wi-Fi)",
            font=("Segoe UI", 9),
            fg="#94a3b8",
            bg="#0f172a"
        )
        sub_lbl.pack(anchor="w", pady=(2, 0))

        # Main Container
        main_frame = tk.Frame(self.root, bg="#0b1120", padx=16, pady=12)
        main_frame.pack(fill="both", expand=True)

        # Status Cards Container
        cards_frame = tk.Frame(main_frame, bg="#0b1120")
        cards_frame.pack(fill="x", pady=(0, 10))

        # 1. ADB Status Card
        self.card_adb = tk.Frame(cards_frame, bg="#1e293b", padx=12, pady=10, relief="solid", bd=1)
        self.card_adb.pack(fill="x", pady=4)

        adb_top = tk.Frame(self.card_adb, bg="#1e293b")
        adb_top.pack(fill="x")

        self.adb_dot = tk.Label(adb_top, text="●", font=("Segoe UI", 12), fg="#ef4444", bg="#1e293b")
        self.adb_dot.pack(side="left", padx=(0, 6))

        self.adb_status_text = tk.Label(
            adb_top,
            text="ADB Device: Scanning...",
            font=("Segoe UI", 10, "bold"),
            fg="#f8fafc",
            bg="#1e293b"
        )
        self.adb_status_text.pack(side="left")

        self.btn_sync_adb = tk.Button(
            adb_top,
            text="Sync ADB Reverse",
            font=("Segoe UI", 8, "bold"),
            bg="#0284c7",
            fg="#ffffff",
            activebackground="#0369a1",
            activeforeground="#ffffff",
            relief="flat",
            padx=8,
            pady=2,
            cursor="hand2",
            command=self.run_adb_reverse
        )
        self.btn_sync_adb.pack(side="right")

        # 2. Client Status Card
        self.card_client = tk.Frame(cards_frame, bg="#1e293b", padx=12, pady=10, relief="solid", bd=1)
        self.card_client.pack(fill="x", pady=4)

        client_top = tk.Frame(self.card_client, bg="#1e293b")
        client_top.pack(fill="x")

        self.client_dot = tk.Label(client_top, text="●", font=("Segoe UI", 12), fg="#64748b", bg="#1e293b")
        self.client_dot.pack(side="left", padx=(0, 6))

        self.client_status_text = tk.Label(
            client_top,
            text="Mobile App: Waiting for connection...",
            font=("Segoe UI", 10, "bold"),
            fg="#94a3b8",
            bg="#1e293b"
        )
        self.client_status_text.pack(side="left")

        self.lbl_stats = tk.Label(
            client_top,
            text="Inputs: 0",
            font=("Segoe UI", 9),
            fg="#38bdf8",
            bg="#1e293b"
        )
        self.lbl_stats.pack(side="right")

        # 3. Connection Instructions Card
        info_card = tk.Frame(cards_frame, bg="#131d33", padx=12, pady=8, relief="solid", bd=1)
        info_card.pack(fill="x", pady=4)

        lbl_info = tk.Label(
            info_card,
            text=f"🔌 USB Port: localhost:{self.port}   |   📡 Wi-Fi IP: {self.local_ip}:{self.port}",
            font=("Consolas", 9),
            fg="#38bdf8",
            bg="#131d33"
        )
        lbl_info.pack(anchor="w")

        # Live Activity Feed Section
        log_header = tk.Frame(main_frame, bg="#0b1120")
        log_header.pack(fill="x", pady=(10, 4))

        tk.Label(
            log_header,
            text="LIVE ACTIVITY & KEYSTROKE STREAM",
            font=("Segoe UI", 9, "bold"),
            fg="#94a3b8",
            bg="#0b1120"
        ).pack(side="left")

        btn_clear = tk.Button(
            log_header,
            text="Clear Log",
            font=("Segoe UI", 8),
            bg="#334155",
            fg="#cbd5e1",
            relief="flat",
            padx=6,
            pady=1,
            cursor="hand2",
            command=self.clear_log
        )
        btn_clear.pack(side="right")

        # Scrolled Text Widget
        self.log_box = scrolledtext.ScrolledText(
            main_frame,
            wrap="word",
            bg="#020617",
            fg="#e2e8f0",
            insertbackground="#38bdf8",
            font=("Consolas", 9),
            relief="flat",
            bd=1
        )
        self.log_box.pack(fill="both", expand=True)

        # Log tag colors
        self.log_box.tag_config("time", foreground="#64748b")
        self.log_box.tag_config("info", foreground="#38bdf8")
        self.log_box.tag_config("success", foreground="#10b981")
        self.log_box.tag_config("warn", foreground="#f59e0b")
        self.log_box.tag_config("key", foreground="#a855f7")

        self.append_log("⚡ Companion server initialized. Starting services...", "info")

    def append_log(self, message, tag="info"):
        timestamp = datetime.now().strftime("[%H:%M:%S] ")
        self.log_box.insert("end", timestamp, "time")
        self.log_box.insert("end", message + "\n", tag)
        if self.auto_scroll:
            self.log_box.see("end")

    def clear_log(self):
        self.log_box.delete("1.0", "end")

    def update_adb_ui(self, is_connected, device_name):
        if is_connected:
            self.adb_dot.config(fg="#10b981")
            self.adb_status_text.config(
                text=f"ADB Device: Connected ({device_name})",
                fg="#10b981"
            )
        else:
            self.adb_dot.config(fg="#ef4444")
            self.adb_status_text.config(
                text="ADB Device: Not detected (Plug USB & enable USB debugging)",
                fg="#f87171"
            )

    def update_client_ui(self, is_connected, client_addr=""):
        if is_connected:
            self.client_dot.config(fg="#10b981")
            self.client_status_text.config(
                text=f"Mobile App: Connected ({client_addr})",
                fg="#10b981"
            )
        else:
            self.client_dot.config(fg="#64748b")
            self.client_status_text.config(
                text="Mobile App: Waiting for connection...",
                fg="#94a3b8"
            )

    def run_adb_reverse(self):
        try:
            res = subprocess.run(
                ["adb", "reverse", f"tcp:{self.port}", f"tcp:{self.port}"],
                capture_output=True,
                text=True,
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
            )
            if res.returncode == 0:
                self.append_log(f"✔ ADB Reverse port {self.port} successfully synced!", "success")
            else:
                self.append_log(f"✖ ADB Reverse failed: {res.stderr.strip()}", "warn")
        except Exception as e:
            self.append_log(f"✖ Could not run adb: {e}", "warn")

    def adb_monitor_loop(self):
        last_state = None
        while True:
            try:
                res = subprocess.run(
                    ["adb", "devices"],
                    capture_output=True,
                    text=True,
                    creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
                )
                lines = [line.strip() for line in res.stdout.splitlines() if line.strip()]
                device = None
                for line in lines[1:]:
                    parts = line.split()
                    if len(parts) >= 2 and parts[1] == 'device':
                        device = parts[0]
                        break

                current_state = device is not None
                if current_state != last_state:
                    last_state = current_state
                    if current_state:
                        self.root.after(0, self.update_adb_ui, True, device)
                        self.root.after(0, self.append_log, f"✔ Phone detected via ADB: {device}", "success")
                        # Auto configure reverse port forwarding
                        self.run_adb_reverse()
                    else:
                        self.root.after(0, self.update_adb_ui, False, "")
                        self.root.after(0, self.append_log, "⚠ Phone disconnected from ADB.", "warn")

            except Exception:
                pass
            time.sleep(3)

    def start_websocket_server(self):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        import websockets

        async def handler(websocket):
            client_ip = websocket.remote_address[0] if websocket.remote_address else '127.0.0.1'
            self.client_connected = True
            self.client_ip = client_ip

            self.root.after(0, self.update_client_ui, True, client_ip)
            self.root.after(0, self.append_log, f"📱 Phone connected from {client_ip}!", "success")

            try:
                await websocket.send(json.dumps({
                    "type": "welcome",
                    "message": "Connected to Laptop ADB Keyboard Companion!",
                    "platform": sys.platform
                }))

                async for message in websocket:
                    try:
                        data = json.loads(message)
                        msg_type = data.get('type')

                        if msg_type == 'ping':
                            await websocket.send(json.dumps({
                                "type": "pong",
                                "timestamp": data.get("timestamp")
                            }))

                        elif msg_type == 'key_press':
                            raw_key = data.get('key', '')
                            if raw_key:
                                self.total_keystrokes += 1
                                self.root.after(0, self.lbl_stats.config, {"text": f"Inputs: {self.total_keystrokes}"})
                                self.root.after(0, self.append_log, f"⌨ Key: '{raw_key}'", "key")

                                k_lower = raw_key.lower().strip()
                                if k_lower in PYAUTOGUI_KEY_MAP:
                                    pyautogui.press(PYAUTOGUI_KEY_MAP[k_lower])
                                else:
                                    try:
                                        pyautogui.write(raw_key)
                                    except Exception:
                                        pyautogui.press(raw_key)

                        elif msg_type == 'type_text':
                            text = data.get('text', '')
                            if text:
                                self.total_keystrokes += len(text)
                                self.root.after(0, self.lbl_stats.config, {"text": f"Inputs: {self.total_keystrokes}"})
                                self.root.after(0, self.append_log, f"📝 Text: '{text[:45]}...'", "info")

                                if len(text) > 4 or '\n' in text:
                                    try:
                                        pyperclip.copy(text)
                                        pyautogui.hotkey('ctrl', 'v')
                                    except Exception:
                                        pyautogui.write(text)
                                else:
                                    try:
                                        pyautogui.write(text)
                                    except Exception:
                                        pass

                        elif msg_type == 'shortcut':
                            keys = data.get('keys', [])
                            if keys:
                                self.total_keystrokes += 1
                                self.root.after(0, self.lbl_stats.config, {"text": f"Inputs: {self.total_keystrokes}"})
                                combo_str = " + ".join([k.upper() for k in keys])
                                self.root.after(0, self.append_log, f"⚡ Shortcut: {combo_str}", "key")

                                normalized = [normalize_key(k) for k in keys if k]
                                pyautogui.hotkey(*normalized)

                        elif msg_type == 'key_down':
                            k = normalize_key(data.get('key', ''))
                            if k:
                                pyautogui.keyDown(k)

                        elif msg_type == 'key_up':
                            k = normalize_key(data.get('key', ''))
                            if k:
                                pyautogui.keyUp(k)

                        elif msg_type == 'mouse_move':
                            dx = data.get('dx', 0)
                            dy = data.get('dy', 0)
                            pyautogui.moveRel(int(dx), int(dy), _pause=False)

                        elif msg_type == 'mouse_click':
                            btn = data.get('button', 'left')
                            double = data.get('double', False)
                            clicks = 2 if double else 1
                            pyautogui.click(button=btn, clicks=clicks, _pause=False)
                            self.root.after(0, self.append_log, f"🖱 Click: {btn} (x{clicks})", "info")

                        elif msg_type == 'mouse_scroll':
                            amt = data.get('amount', 0)
                            pyautogui.scroll(int(amt), _pause=False)

                    except Exception as e:
                        pass

            except Exception:
                pass
            finally:
                self.client_connected = False
                self.root.after(0, self.update_client_ui, False)
                self.root.after(0, self.append_log, "[-] Phone disconnected.", "warn")

        async def run_server():
            async with websockets.serve(handler, "0.0.0.0", self.port):
                self.root.after(0, self.append_log, f"✔ WebSocket Server active on ws://0.0.0.0:{self.port}", "success")
                await asyncio.Future()

        try:
            loop.run_until_complete(run_server())
        except Exception as e:
            self.root.after(0, self.append_log, f"Server error: {e}", "warn")

def main():
    root = tk.Tk()
    app = CompanionApp(root)
    root.mainloop()

if __name__ == '__main__':
    main()
