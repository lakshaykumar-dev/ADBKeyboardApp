import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StatusBar,
  Vibration,
  Modal,
  PanResponder,
  useColorScheme,
  Dimensions,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';

type TabType = 'keyboard' | 'typewriter' | 'shortcuts' | 'trackpad';

type ConnectionState = 'connected' | 'connecting' | 'disconnected';

export default function App() {
  return (
    <SafeAreaProvider>
      <KeyboardApp />
    </SafeAreaProvider>
  );
}

function KeyboardApp() {
  const isDark = useColorScheme() === 'dark';

  // Connection settings
  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState('8080');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionState>('disconnected');
  const [latency, setLatency] = useState<number | null>(null);
  const [hapticEnabled, setHapticEnabled] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('keyboard');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  // Active keyboard modifier states
  const [ctrlActive, setCtrlActive] = useState(false);
  const [altActive, setAltActive] = useState(false);
  const [shiftActive, setShiftActive] = useState(false);
  const [winActive, setWinActive] = useState(false);
  const [capsActive, setCapsActive] = useState(false);

  // Text writer input
  const [bufferText, setBufferText] = useState('');
  const [liveStreamMode, setLiveStreamMode] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<any>(null);
  const reconnectTimeoutRef = useRef<any>(null);

  // Send packet to server
  const sendPacket = useCallback((payload: any) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const triggerHaptic = useCallback(() => {
    if (hapticEnabled) {
      try {
        Vibration.vibrate(10);
      } catch (e) {
        // Silently ignore vibration error if not supported
      }
    }
  }, [hapticEnabled]);

  // Connect to WebSocket server
  const connectToServer = useCallback(() => {
    if (socketRef.current) {
      try {
        socketRef.current.close();
      } catch (e) {}
      socketRef.current = null;
    }

    setConnectionStatus('connecting');
    const wsUrl = `ws://${host.trim()}:${port.trim()}`;

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setConnectionStatus('connected');
        // Start ping heartbeat
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
          }
        }, 2000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'pong' && data.timestamp) {
            setLatency(Date.now() - data.timestamp);
          }
        } catch (e) {}
      };

      const scheduleReconnect = () => {
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          connectToServer();
        }, 2000);
      };

      ws.onerror = () => {
        setConnectionStatus('disconnected');
        setLatency(null);
        scheduleReconnect();
      };

      ws.onclose = () => {
        setConnectionStatus('disconnected');
        setLatency(null);
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        scheduleReconnect();
      };

      socketRef.current = ws;
    } catch (err) {
      setConnectionStatus('disconnected');
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        connectToServer();
      }, 2000);
    }
  }, [host, port]);

  useEffect(() => {
    connectToServer();
    return () => {
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [connectToServer]);

  // Key press handler with active modifiers
  const handleKeyPress = useCallback((key: string) => {
    triggerHaptic();

    const activeModifiers: string[] = [];
    if (ctrlActive) activeModifiers.push('ctrl');
    if (altActive) activeModifiers.push('alt');
    if (shiftActive) activeModifiers.push('shift');
    if (winActive) activeModifiers.push('win');

    if (activeModifiers.length > 0) {
      // Send as shortcut combination
      sendPacket({
        type: 'shortcut',
        keys: [...activeModifiers, key],
      });
      // Reset one-time modifiers (except caps)
      setCtrlActive(false);
      setAltActive(false);
      setShiftActive(false);
      setWinActive(false);
    } else {
      let finalKey = key;
      if (key.length === 1) {
        finalKey = (capsActive || shiftActive) ? key.toUpperCase() : key.toLowerCase();
      }
      sendPacket({
        type: 'key_press',
        key: finalKey,
      });
    }
  }, [ctrlActive, altActive, shiftActive, winActive, capsActive, triggerHaptic, sendPacket]);

  // Send single shortcut directly
  const handleShortcut = useCallback((keys: string[]) => {
    triggerHaptic();
    sendPacket({
      type: 'shortcut',
      keys: keys,
    });
  }, [triggerHaptic, sendPacket]);

  // Send typed text string
  const handleSendBuffer = useCallback((textToSend: string, appendEnter: boolean = false) => {
    if (!textToSend && !appendEnter) return;
    triggerHaptic();
    if (textToSend) {
      sendPacket({
        type: 'type_text',
        text: textToSend,
      });
    }
    if (appendEnter) {
      setTimeout(() => {
        sendPacket({ type: 'key_press', key: 'enter' });
      }, 50);
    }
    setBufferText('');
  }, [triggerHaptic, sendPacket]);

  // Live stream text changes
  const handleLiveTextChange = useCallback((newText: string) => {
    if (!liveStreamMode) {
      setBufferText(newText);
      return;
    }

    if (newText.length > bufferText.length) {
      // User typed or pasted characters
      const added = newText.slice(bufferText.length);
      triggerHaptic();
      sendPacket({
        type: 'type_text',
        text: added,
      });
    } else if (newText.length < bufferText.length) {
      // User pressed backspace
      const diff = bufferText.length - newText.length;
      triggerHaptic();
      for (let i = 0; i < diff; i++) {
        sendPacket({
          type: 'key_press',
          key: 'backspace',
        });
      }
    }
    setBufferText(newText);
  }, [bufferText, liveStreamMode, triggerHaptic, sendPacket]);

  // Trackpad PanResponder
  const lastPanRef = useRef({ x: 0, y: 0 });
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt, gestureState) => {
        lastPanRef.current = { x: gestureState.x0, y: gestureState.y0 };
      },
      onPanResponderMove: (evt, gestureState) => {
        const dx = gestureState.moveX - lastPanRef.current.x;
        const dy = gestureState.moveY - lastPanRef.current.y;
        lastPanRef.current = { x: gestureState.moveX, y: gestureState.moveY };

        // Apply mouse movement sensitivity scaling
        const sensitivity = 1.3;
        sendPacket({
          type: 'mouse_move',
          dx: Math.round(dx * sensitivity),
          dy: Math.round(dy * sensitivity),
        });
      },
      onPanResponderRelease: (evt, gestureState) => {
        // Quick tap detection for left click
        if (Math.abs(gestureState.dx) < 4 && Math.abs(gestureState.dy) < 4) {
          triggerHaptic();
          sendPacket({ type: 'mouse_click', button: 'left' });
        }
      },
    })
  ).current;

  return (
    <SafeAreaView style={styles.safeContainer} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="light-content" />

      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.appTitle}>ADB KEYBOARD</Text>
          <View style={styles.badgeContainer}>
            <View
              style={[
                styles.statusDot,
                connectionStatus === 'connected'
                  ? styles.dotConnected
                  : connectionStatus === 'connecting'
                  ? styles.dotConnecting
                  : styles.dotDisconnected,
              ]}
            />
            <Text style={styles.statusText}>
              {connectionStatus === 'connected'
                ? `ONLINE ${latency !== null ? `(${latency}ms)` : ''}`
                : connectionStatus === 'connecting'
                ? 'CONNECTING...'
                : 'OFFLINE'}
            </Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setIsGuideOpen(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.iconButtonText}>ADB GUIDE</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconButton}
            onPress={connectToServer}
            activeOpacity={0.7}
          >
            <Text style={styles.iconButtonText}>RECONNECT</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.iconButton, styles.settingsBtn]}
            onPress={() => setIsSettingsOpen(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.iconButtonText}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Navigation Mode Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'keyboard' && styles.tabItemActive]}
          onPress={() => setActiveTab('keyboard')}
        >
          <Text style={[styles.tabLabel, activeTab === 'keyboard' && styles.tabLabelActive]}>
            ⌨️ Full PC
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'typewriter' && styles.tabItemActive]}
          onPress={() => setActiveTab('typewriter')}
        >
          <Text style={[styles.tabLabel, activeTab === 'typewriter' && styles.tabLabelActive]}>
            📝 Text / Voice
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'shortcuts' && styles.tabItemActive]}
          onPress={() => setActiveTab('shortcuts')}
        >
          <Text style={[styles.tabLabel, activeTab === 'shortcuts' && styles.tabLabelActive]}>
            ⚡ Shortcuts
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'trackpad' && styles.tabItemActive]}
          onPress={() => setActiveTab('trackpad')}
        >
          <Text style={[styles.tabLabel, activeTab === 'trackpad' && styles.tabLabelActive]}>
            🖱️ Trackpad
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main Tab Content */}
      <View style={styles.contentContainer}>
        {activeTab === 'keyboard' && (
          <ScrollView
            contentContainerStyle={styles.keyboardScroll}
            showsVerticalScrollIndicator={false}
          >
            {/* Function Keys Row */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fKeyScroll}>
              <View style={styles.fKeyRow}>
                <KeyCap label="ESC" width={52} highlight onPress={() => handleKeyPress('escape')} />
                {['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'].map((f) => (
                  <KeyCap key={f} label={f} width={44} onPress={() => handleKeyPress(f.toLowerCase())} />
                ))}
                <KeyCap label="DEL" width={50} highlight onPress={() => handleKeyPress('delete')} />
                <KeyCap label="PRTSC" width={56} onPress={() => handleKeyPress('printscreen')} />
              </View>
            </ScrollView>

            {/* Numbers Row */}
            <View style={styles.keyRow}>
              {['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='].map((k) => (
                <KeyCap key={k} label={k} onPress={() => handleKeyPress(k)} />
              ))}
              <KeyCap label="⌫" width={52} highlight onPress={() => handleKeyPress('backspace')} />
            </View>

            {/* QWERTY Row 1 */}
            <View style={styles.keyRow}>
              <KeyCap label="TAB" width={48} highlight onPress={() => handleKeyPress('tab')} />
              {['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']'].map((k) => (
                <KeyCap key={k} label={k} onPress={() => handleKeyPress(k)} />
              ))}
              <KeyCap label="\" width={36} onPress={() => handleKeyPress('\\')} />
            </View>

            {/* QWERTY Row 2 */}
            <View style={styles.keyRow}>
              <KeyCap
                label="CAPS"
                width={52}
                highlight={capsActive}
                activeColor="#06b6d4"
                onPress={() => {
                  triggerHaptic();
                  setCapsActive(!capsActive);
                }}
              />
              {['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', '\''].map((k) => (
                <KeyCap key={k} label={k} onPress={() => handleKeyPress(k)} />
              ))}
              <KeyCap label="ENTER ↵" width={64} highlight onPress={() => handleKeyPress('enter')} />
            </View>

            {/* QWERTY Row 3 */}
            <View style={styles.keyRow}>
              <KeyCap
                label="SHIFT ⇧"
                width={66}
                highlight={shiftActive}
                activeColor="#f59e0b"
                onPress={() => {
                  triggerHaptic();
                  setShiftActive(!shiftActive);
                }}
              />
              {['Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/'].map((k) => (
                <KeyCap key={k} label={k} onPress={() => handleKeyPress(k)} />
              ))}
              <KeyCap label="▲" width={42} highlight onPress={() => handleKeyPress('up')} />
            </View>

            {/* Bottom Modifier & Arrow Keys Row */}
            <View style={styles.keyRow}>
              <KeyCap
                label="CTRL"
                width={48}
                highlight={ctrlActive}
                activeColor="#ec4899"
                onPress={() => {
                  triggerHaptic();
                  setCtrlActive(!ctrlActive);
                }}
              />
              <KeyCap
                label="WIN"
                width={44}
                highlight={winActive}
                activeColor="#3b82f6"
                onPress={() => {
                  triggerHaptic();
                  setWinActive(!winActive);
                }}
              />
              <KeyCap
                label="ALT"
                width={44}
                highlight={altActive}
                activeColor="#8b5cf6"
                onPress={() => {
                  triggerHaptic();
                  setAltActive(!altActive);
                }}
              />
              <KeyCap
                label="SPACE"
                flex={1}
                highlight
                onPress={() => handleKeyPress('space')}
              />
              <KeyCap label="◀" width={40} highlight onPress={() => handleKeyPress('left')} />
              <KeyCap label="▼" width={40} highlight onPress={() => handleKeyPress('down')} />
              <KeyCap label="▶" width={40} highlight onPress={() => handleKeyPress('right')} />
            </View>

            {/* Secondary Utility Row */}
            <View style={styles.utilityRow}>
              <KeyCap label="HOME" width={56} onPress={() => handleKeyPress('home')} />
              <KeyCap label="END" width={56} onPress={() => handleKeyPress('end')} />
              <KeyCap label="PG UP" width={60} onPress={() => handleKeyPress('pageup')} />
              <KeyCap label="PG DN" width={60} onPress={() => handleKeyPress('pagedown')} />
              <KeyCap label="INS" width={48} onPress={() => handleKeyPress('insert')} />
            </View>

            {/* Dedicated Numeric Keypad (Numpad) */}
            <View style={styles.numpadContainer}>
              <Text style={styles.numpadTitle}>NUMERIC KEYPAD & QUICK CONTROLS</Text>
              <View style={styles.numpadRow}>
                <KeyCap label="NUM" highlight onPress={() => handleKeyPress('numlock')} />
                <KeyCap label="/" highlight onPress={() => handleKeyPress('/')} />
                <KeyCap label="*" highlight onPress={() => handleKeyPress('*')} />
                <KeyCap label="-" highlight onPress={() => handleKeyPress('-')} />
              </View>
              <View style={styles.numpadRow}>
                <KeyCap label="7" onPress={() => handleKeyPress('7')} />
                <KeyCap label="8" onPress={() => handleKeyPress('8')} />
                <KeyCap label="9" onPress={() => handleKeyPress('9')} />
                <KeyCap label="+" highlight onPress={() => handleKeyPress('+')} />
              </View>
              <View style={styles.numpadRow}>
                <KeyCap label="4" onPress={() => handleKeyPress('4')} />
                <KeyCap label="5" onPress={() => handleKeyPress('5')} />
                <KeyCap label="6" onPress={() => handleKeyPress('6')} />
                <KeyCap label="⌫" highlight onPress={() => handleKeyPress('backspace')} />
              </View>
              <View style={styles.numpadRow}>
                <KeyCap label="1" onPress={() => handleKeyPress('1')} />
                <KeyCap label="2" onPress={() => handleKeyPress('2')} />
                <KeyCap label="3" onPress={() => handleKeyPress('3')} />
                <KeyCap label="ENTER ↵" highlight activeColor="#10b981" onPress={() => handleKeyPress('enter')} />
              </View>
              <View style={styles.numpadRow}>
                <KeyCap label="0" flex={2} onPress={() => handleKeyPress('0')} />
                <KeyCap label="." flex={1} onPress={() => handleKeyPress('.')} />
                <KeyCap label="SPACE" flex={1} highlight onPress={() => handleKeyPress('space')} />
              </View>
            </View>
          </ScrollView>
        )}

        {/* Text / Voice Mode */}
        {activeTab === 'typewriter' && (
          <View style={styles.typewriterContainer}>
            <View style={styles.modeToggleRow}>
              <Text style={styles.sectionHeader}>Native Typing & Voice Input</Text>
              <TouchableOpacity
                style={[styles.streamToggle, liveStreamMode && styles.streamToggleActive]}
                onPress={() => setLiveStreamMode(!liveStreamMode)}
              >
                <Text style={styles.streamToggleText}>
                  {liveStreamMode ? '⚡ Live Stream: ON' : '📥 Buffer Mode: ON'}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.helperTip}>
              {liveStreamMode
                ? 'Every character you type, swipe, or speak is sent directly to your laptop in real-time.'
                : 'Type, paste code, or dictate long paragraphs below. Tap "Send" to push directly into laptop.'}
            </Text>

            <TextInput
              style={styles.textInputBox}
              multiline
              placeholder="Type anything here (supports Gboard, voice dictation, paste)..."
              placeholderTextColor="#64748b"
              value={bufferText}
              onChangeText={handleLiveTextChange}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.typewriterActions}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.btnSend]}
                onPress={() => handleSendBuffer(bufferText, false)}
              >
                <Text style={styles.actionBtnText}>➤ Send Text</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.btnSendEnter]}
                onPress={() => handleSendBuffer(bufferText, true)}
              >
                <Text style={styles.actionBtnText}>↵ Send + Enter</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.btnClear]}
                onPress={() => setBufferText('')}
              >
                <Text style={styles.actionBtnText}>🗑 Clear</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.quickChips}>
              <Text style={styles.chipsTitle}>Quick Inserts:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {['git status', 'git push', 'npm run start', 'cls', 'dir', 'cd ..', 'python ', 'exit'].map(
                  (cmd) => (
                    <TouchableOpacity
                      key={cmd}
                      style={styles.chipItem}
                      onPress={() => handleSendBuffer(cmd, true)}
                    >
                      <Text style={styles.chipText}>{cmd}</Text>
                    </TouchableOpacity>
                  )
                )}
              </ScrollView>
            </View>
          </View>
        )}

        {/* Shortcuts Tab */}
        {activeTab === 'shortcuts' && (
          <ScrollView contentContainerStyle={styles.shortcutsScroll}>
            <Text style={styles.categoryTitle}>Standard Editing</Text>
            <View style={styles.grid2}>
              <ShortcutCard title="Select All" shortcut="Ctrl + A" onPress={() => handleShortcut(['ctrl', 'a'])} />
              <ShortcutCard title="Copy" shortcut="Ctrl + C" onPress={() => handleShortcut(['ctrl', 'c'])} />
              <ShortcutCard title="Paste" shortcut="Ctrl + V" onPress={() => handleShortcut(['ctrl', 'v'])} />
              <ShortcutCard title="Cut" shortcut="Ctrl + X" onPress={() => handleShortcut(['ctrl', 'x'])} />
              <ShortcutCard title="Undo" shortcut="Ctrl + Z" onPress={() => handleShortcut(['ctrl', 'z'])} />
              <ShortcutCard title="Redo" shortcut="Ctrl + Y" onPress={() => handleShortcut(['ctrl', 'y'])} />
              <ShortcutCard title="Save" shortcut="Ctrl + S" onPress={() => handleShortcut(['ctrl', 's'])} />
              <ShortcutCard title="Find" shortcut="Ctrl + F" onPress={() => handleShortcut(['ctrl', 'f'])} />
            </View>

            <Text style={styles.categoryTitle}>Windows & Navigation</Text>
            <View style={styles.grid2}>
              <ShortcutCard title="Clipboard History" shortcut="Win + V" onPress={() => handleShortcut(['win', 'v'])} />
              <ShortcutCard title="Show Desktop" shortcut="Win + D" onPress={() => handleShortcut(['win', 'd'])} />
              <ShortcutCard title="File Explorer" shortcut="Win + E" onPress={() => handleShortcut(['win', 'e'])} />
              <ShortcutCard title="Run Dialog" shortcut="Win + R" onPress={() => handleShortcut(['win', 'r'])} />
              <ShortcutCard title="Switch App" shortcut="Alt + Tab" onPress={() => handleShortcut(['alt', 'tab'])} />
              <ShortcutCard title="Close Window" shortcut="Alt + F4" onPress={() => handleShortcut(['alt', 'f4'])} />
              <ShortcutCard title="Task Manager" shortcut="Ctrl+Shift+Esc" onPress={() => handleShortcut(['ctrl', 'shift', 'escape'])} />
              <ShortcutCard title="Lock Laptop" shortcut="Win + L" onPress={() => handleShortcut(['win', 'l'])} />
              <ShortcutCard title="New Tab" shortcut="Ctrl + T" onPress={() => handleShortcut(['ctrl', 't'])} />
              <ShortcutCard title="Close Tab" shortcut="Ctrl + W" onPress={() => handleShortcut(['ctrl', 'w'])} />
            </View>

            <Text style={styles.categoryTitle}>Media & Sound</Text>
            <View style={styles.grid3}>
              <ShortcutCard title="Mute" shortcut="🔇" onPress={() => handleKeyPress('volumemute')} />
              <ShortcutCard title="Vol -" shortcut="🔉" onPress={() => handleKeyPress('volumedown')} />
              <ShortcutCard title="Vol +" shortcut="🔊" onPress={() => handleKeyPress('volumeup')} />
              <ShortcutCard title="Prev" shortcut="⏮" onPress={() => handleKeyPress('mediaprev')} />
              <ShortcutCard title="Play / Pause" shortcut="⏯" onPress={() => handleKeyPress('mediaplaypause')} />
              <ShortcutCard title="Next" shortcut="⏭" onPress={() => handleKeyPress('medianext')} />
            </View>
          </ScrollView>
        )}

        {/* Trackpad Tab */}
        {activeTab === 'trackpad' && (
          <View style={styles.trackpadContainer}>
            <View style={styles.trackpadHeader}>
              <Text style={styles.trackpadTitle}>Laptop Touchpad</Text>
              <Text style={styles.trackpadSub}>Drag to move cursor • Tap to Left-Click</Text>
            </View>

            <View style={styles.trackpadSurface} {...panResponder.panHandlers}>
              <View style={styles.trackpadCrosshair}>
                <View style={styles.centerDot} />
              </View>
              <Text style={styles.touchAreaLabel}>TOUCH SENSITIVE PAD</Text>
            </View>

            {/* Mouse Buttons */}
            <View style={styles.mouseButtonsRow}>
              <TouchableOpacity
                style={[styles.mouseBtn, styles.mouseBtnLeft]}
                onPress={() => {
                  triggerHaptic();
                  sendPacket({ type: 'mouse_click', button: 'left' });
                }}
                activeOpacity={0.6}
              >
                <Text style={styles.mouseBtnText}>LEFT CLICK</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.mouseBtn, styles.mouseBtnMiddle]}
                onPress={() => {
                  triggerHaptic();
                  sendPacket({ type: 'mouse_click', button: 'middle' });
                }}
                activeOpacity={0.6}
              >
                <Text style={styles.mouseBtnText}>SCROLL CLICK</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.mouseBtn, styles.mouseBtnRight]}
                onPress={() => {
                  triggerHaptic();
                  sendPacket({ type: 'mouse_click', button: 'right' });
                }}
                activeOpacity={0.6}
              >
                <Text style={styles.mouseBtnText}>RIGHT CLICK</Text>
              </TouchableOpacity>
            </View>

            {/* Quick Scroll Actions */}
            <View style={styles.scrollButtonsRow}>
              <TouchableOpacity
                style={styles.scrollBtn}
                onPress={() => {
                  triggerHaptic();
                  sendPacket({ type: 'mouse_scroll', amount: 240 });
                }}
              >
                <Text style={styles.scrollBtnText}>▲ Scroll Up</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.scrollBtn}
                onPress={() => {
                  triggerHaptic();
                  sendPacket({ type: 'mouse_scroll', amount: -240 });
                }}
              >
                <Text style={styles.scrollBtnText}>▼ Scroll Down</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Settings Modal */}
      <Modal visible={isSettingsOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Connection Settings</Text>

            <Text style={styles.inputLabel}>Host / IP Address:</Text>
            <TextInput
              style={styles.modalInput}
              value={host}
              onChangeText={setHost}
              placeholder="127.0.0.1 or LAN IP"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.inputLabel}>Port:</Text>
            <TextInput
              style={styles.modalInput}
              value={port}
              onChangeText={setPort}
              keyboardType="numeric"
              placeholder="8080"
              placeholderTextColor="#64748b"
            />

            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => setHapticEnabled(!hapticEnabled)}
            >
              <Text style={styles.toggleLabel}>Vibration / Haptic Feedback</Text>
              <Text style={styles.toggleVal}>{hapticEnabled ? 'ON' : 'OFF'}</Text>
            </TouchableOpacity>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalActionBtn, styles.modalSaveBtn]}
                onPress={() => {
                  setIsSettingsOpen(false);
                  connectToServer();
                }}
              >
                <Text style={styles.modalActionBtnText}>Save & Connect</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalActionBtn, styles.modalCloseBtn]}
                onPress={() => setIsSettingsOpen(false)}
              >
                <Text style={styles.modalActionBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ADB Guide Modal */}
      <Modal visible={isGuideOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>How to Connect via ADB</Text>

            <ScrollView style={styles.guideScroll}>
              <Text style={styles.guideStep}>1. Connect Phone to Laptop</Text>
              <Text style={styles.guideDesc}>
                Plug your phone into your laptop via USB cable and ensure "USB Debugging" is enabled in Developer Options.
              </Text>

              <Text style={styles.guideStep}>2. Start Companion Server</Text>
              <Text style={styles.guideDesc}>
                On your laptop, simply double-click:
              </Text>
              <View style={styles.codeSnippet}>
                <Text style={styles.codeText}>start-companion.bat</Text>
              </View>
              <Text style={styles.guideDesc}>
                Or run manually in terminal:
              </Text>
              <View style={styles.codeSnippet}>
                <Text style={styles.codeText}>adb reverse tcp:8080 tcp:8080</Text>
                <Text style={styles.codeText}>python server/companion_server.py</Text>
              </View>

              <Text style={styles.guideStep}>3. Enjoy USB Keyboard!</Text>
              <Text style={styles.guideDesc}>
                The app will immediately connect to 127.0.0.1:8080 through ADB reverse port forwarding. Zero Wi-Fi required, sub-millisecond response!
              </Text>
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalActionBtn, styles.modalSaveBtn, { marginTop: 16 }]}
              onPress={() => setIsGuideOpen(false)}
            >
              <Text style={styles.modalActionBtnText}>Got it!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// KeyCap component with modern styling
function KeyCap({
  label,
  width,
  flex,
  highlight,
  activeColor,
  onPress,
}: {
  label: string;
  width?: number;
  flex?: number;
  highlight?: boolean;
  activeColor?: string;
  onPress: () => void;
}) {
  const dynamicStyle = {
    ...(width ? { width } : {}),
    ...(flex ? { flex } : {}),
    ...(activeColor ? { borderColor: activeColor, backgroundColor: '#1e293b' } : {}),
  };

  return (
    <TouchableOpacity
      style={[styles.keyCap, highlight && styles.keyCapHighlight, dynamicStyle]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[
          styles.keyCapText,
          highlight && styles.keyCapTextHighlight,
          activeColor ? { color: activeColor } : {},
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function ShortcutCard({
  title,
  shortcut,
  onPress,
}: {
  title: string;
  shortcut: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.shortcutCard} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.shortcutTitle}>{title}</Text>
      <View style={styles.shortcutPill}>
        <Text style={styles.shortcutPillText}>{shortcut}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: '#0a0e17',
  },
  header: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    backgroundColor: '#0f172a',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  appTitle: {
    color: '#38bdf8',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  dotConnected: {
    backgroundColor: '#10b981',
  },
  dotConnecting: {
    backgroundColor: '#f59e0b',
  },
  dotDisconnected: {
    backgroundColor: '#ef4444',
  },
  statusText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    backgroundColor: '#1e293b',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  settingsBtn: {
    paddingHorizontal: 8,
  },
  iconButtonText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0b1120',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabItemActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#38bdf8',
    backgroundColor: '#131d33',
  },
  tabLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: '#38bdf8',
    fontWeight: '700',
  },
  contentContainer: {
    flex: 1,
  },
  keyboardScroll: {
    padding: 6,
    paddingBottom: 24,
  },
  fKeyScroll: {
    marginBottom: 6,
  },
  fKeyRow: {
    flexDirection: 'row',
    gap: 4,
  },
  keyRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 5,
    justifyContent: 'center',
  },
  keyCap: {
    height: 44,
    minWidth: 26,
    flex: 1,
    backgroundColor: '#1a2234',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#29354d',
    elevation: 2,
    paddingHorizontal: 2,
  },
  keyCapHighlight: {
    backgroundColor: '#243048',
    borderColor: '#3b82f6',
  },
  keyCapText: {
    color: '#e2e8f0',
    fontSize: 11,
    fontWeight: '700',
  },
  keyCapTextHighlight: {
    color: '#60a5fa',
  },
  utilityRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 6,
  },
  numpadContainer: {
    marginTop: 18,
    backgroundColor: '#0f172a',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  numpadTitle: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
    textAlign: 'center',
  },
  numpadRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
    justifyContent: 'center',
  },
  typewriterContainer: {
    flex: 1,
    padding: 16,
  },
  modeToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sectionHeader: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  streamToggle: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  streamToggleActive: {
    backgroundColor: '#0369a1',
    borderColor: '#38bdf8',
  },
  streamToggleText: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '700',
  },
  helperTip: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 12,
    lineHeight: 16,
  },
  textInputBox: {
    backgroundColor: '#111827',
    color: '#f8fafc',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    minHeight: 120,
    textAlignVertical: 'top',
    fontSize: 15,
  },
  typewriterActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSend: {
    backgroundColor: '#0284c7',
  },
  btnSendEnter: {
    backgroundColor: '#10b981',
  },
  btnClear: {
    flex: 0.6,
    backgroundColor: '#334155',
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  quickChips: {
    marginTop: 20,
  },
  chipsTitle: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  chipItem: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  chipText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '600',
  },
  shortcutsScroll: {
    padding: 16,
  },
  categoryTitle: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 10,
    marginBottom: 8,
  },
  grid2: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  grid3: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  shortcutCard: {
    width: '48%',
    backgroundColor: '#131d33',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shortcutTitle: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600',
  },
  shortcutPill: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#334155',
  },
  shortcutPillText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  trackpadContainer: {
    flex: 1,
    padding: 14,
  },
  trackpadHeader: {
    alignItems: 'center',
    marginBottom: 10,
  },
  trackpadTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  trackpadSub: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  trackpadSurface: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackpadCrosshair: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#38bdf8',
  },
  touchAreaLabel: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: 10,
  },
  mouseButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  mouseBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mouseBtnLeft: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  mouseBtnMiddle: {
    flex: 0.8,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#475569',
  },
  mouseBtnRight: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  mouseBtnText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700',
  },
  scrollButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  scrollBtn: {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  scrollBtnText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  modalTitle: {
    color: '#38bdf8',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  inputLabel: {
    color: '#cbd5e1',
    fontSize: 13,
    marginBottom: 6,
    marginTop: 8,
  },
  modalInput: {
    backgroundColor: '#1e293b',
    color: '#ffffff',
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#1e293b',
  },
  toggleLabel: {
    color: '#e2e8f0',
    fontSize: 14,
  },
  toggleVal: {
    color: '#38bdf8',
    fontWeight: '700',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  modalActionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalSaveBtn: {
    backgroundColor: '#0284c7',
  },
  modalCloseBtn: {
    backgroundColor: '#334155',
  },
  modalActionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  guideScroll: {
    maxHeight: 340,
  },
  guideStep: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 4,
  },
  guideDesc: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
  },
  codeSnippet: {
    backgroundColor: '#020617',
    padding: 10,
    borderRadius: 6,
    marginVertical: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#38bdf8',
  },
  codeText: {
    color: '#38bdf8',
    fontFamily: 'monospace',
    fontSize: 12,
  },
});
