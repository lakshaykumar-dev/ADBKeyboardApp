"""
ADB Remote Keyboard Companion Server for Windows
Powered by PyAutoGUI + WebSockets.
Simulates real PC keyboard keystrokes, shortcuts, text typing, and mouse trackpad events.
"""

import asyncio
import json
import sys
import socket
import pyautogui
import pyperclip

# Configure PyAutoGUI for ultra-low latency & responsiveness
pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0.001

# Map app key strings to PyAutoGUI key names
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

def handle_key_press(raw_key: str):
    k_lower = raw_key.lower().strip()
    if k_lower in PYAUTOGUI_KEY_MAP:
        mapped = PYAUTOGUI_KEY_MAP[k_lower]
        pyautogui.press(mapped)
    else:
        # Standard character: A-Z, 0-9, symbols
        try:
            pyautogui.write(raw_key)
        except Exception:
            pyautogui.press(raw_key)

def handle_shortcut(keys: list):
    normalized = [normalize_key(k) for k in keys if k]
    if normalized:
        pyautogui.hotkey(*normalized)

def handle_type_text(text: str):
    if not text:
        return
    # For multiline or long text, use instant clipboard paste for 100% Unicode & speed
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
            for ch in text:
                handle_key_press(ch)

def handle_mouse_move(dx: float, dy: float):
    pyautogui.moveRel(int(dx), int(dy), _pause=False)

def handle_mouse_click(button: str = 'left', double: bool = False):
    btn = 'left'
    if button in ['right', 'middle']:
        btn = button
    clicks = 2 if double else 1
    pyautogui.click(button=btn, clicks=clicks, _pause=False)

def handle_mouse_scroll(amount: int):
    # PyAutoGUI scroll: positive = up, negative = down
    pyautogui.scroll(int(amount), _pause=False)

async def handle_client(websocket):
    client_ip = websocket.remote_address[0] if websocket.remote_address else 'unknown'
    print(f"[+] Client connected from {client_ip}", flush=True)
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
                        print(f"[>] Key Press: '{raw_key}'", flush=True)
                        handle_key_press(raw_key)

                elif msg_type == 'type_text':
                    text = data.get('text', '')
                    if text:
                        print(f"[>] Type Text: '{text[:40]}...'", flush=True)
                        handle_type_text(text)

                elif msg_type == 'shortcut':
                    keys = data.get('keys', [])
                    if keys:
                        print(f"[>] Shortcut: {keys}", flush=True)
                        handle_shortcut(keys)

                elif msg_type == 'key_down':
                    key = normalize_key(data.get('key', ''))
                    if key:
                        print(f"[>] Key Down: '{key}'", flush=True)
                        pyautogui.keyDown(key)

                elif msg_type == 'key_up':
                    key = normalize_key(data.get('key', ''))
                    if key:
                        print(f"[>] Key Up: '{key}'", flush=True)
                        pyautogui.keyUp(key)

                elif msg_type == 'mouse_move':
                    dx = data.get('dx', 0)
                    dy = data.get('dy', 0)
                    handle_mouse_move(dx, dy)

                elif msg_type == 'mouse_click':
                    btn = data.get('button', 'left')
                    double = data.get('double', False)
                    print(f"[>] Mouse Click: {btn} (double={double})", flush=True)
                    handle_mouse_click(btn, double)

                elif msg_type == 'mouse_scroll':
                    amount = data.get('amount', 0)
                    handle_mouse_scroll(amount)

            except Exception as e:
                print(f"[!] Error processing packet: {e}", flush=True)

    except Exception as e:
        print(f"[-] Client connection closed: {e}", flush=True)
    finally:
        print("[-] Client disconnected.", flush=True)

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'

async def main():
    import websockets
    port = 8080
    local_ip = get_local_ip()

    print("=" * 60, flush=True)
    print("      ADB REMOTE KEYBOARD COMPANION SERVER (WINDOWS)", flush=True)
    print("=" * 60, flush=True)
    print(f"[*] WebSocket Server listening on: ws://0.0.0.0:{port}", flush=True)
    print(f"[*] USB Mode:  adb reverse tcp:{port} tcp:{port}", flush=True)
    print(f"[*] Wi-Fi Mode: Connect to '{local_ip}:{port}'", flush=True)
    print("=" * 60, flush=True)
    print("[*] Ready and waiting for phone input...", flush=True)

    async with websockets.serve(handle_client, "0.0.0.0", port):
        await asyncio.Future()

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[!] Server stopped by user.", flush=True)
