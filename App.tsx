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
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';

type ConnectionState = 'connected' | 'connecting' | 'disconnected';

interface SentItem {
  id: string;
  text: string;
  timestamp: string;
  withEnter: boolean;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <VoiceTextApp />
    </SafeAreaProvider>
  );
}

function VoiceTextApp() {
  // Connection states
  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState('8080');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionState>('disconnected');
  const [latency, setLatency] = useState<number | null>(null);
  const [hapticEnabled, setHapticEnabled] = useState(true);

  // App UI states
  const [bufferText, setBufferText] = useState('');
  const [liveStreamMode, setLiveStreamMode] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [sentHistory, setSentHistory] = useState<SentItem[]>([]);
  const [activeSnippetCategory, setActiveSnippetCategory] = useState<'dev' | 'phrases' | 'symbols'>('dev');

  // Pulse animation for status indicator
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const inputRef = useRef<TextInput>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<any>(null);
  const reconnectTimeoutRef = useRef<any>(null);

  useEffect(() => {
    if (connectionStatus === 'connected') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [connectionStatus, pulseAnim]);

  // Haptic feedback trigger
  const triggerHaptic = useCallback(() => {
    if (hapticEnabled) {
      try {
        Vibration.vibrate(10);
      } catch {
        // Silently ignore
      }
    }
  }, [hapticEnabled]);

  // Send packet to companion server
  const sendPacket = useCallback((payload: any) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
    }
  }, []);

  // Connect to WebSocket server
  const connectToServer = useCallback(() => {
    if (socketRef.current) {
      try {
        socketRef.current.close();
      } catch {
        // Silently ignore
      }
      socketRef.current = null;
    }

    setConnectionStatus('connecting');
    const wsUrl = `ws://${host.trim()}:${port.trim()}`;

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setConnectionStatus('connected');
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
        } catch {
          // Silently ignore
        }
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
    } catch {
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
      if (socketRef.current) socketRef.current.close();
    };
  }, [connectToServer]);

  // Send buffer text
  const handleSendBuffer = useCallback(
    (textToSend: string, appendEnter: boolean = false) => {
      if (!textToSend && !appendEnter) return;
      triggerHaptic();

      if (textToSend) {
        sendPacket({
          type: 'type_text',
          text: textToSend,
        });

        // Add to recent history
        setSentHistory((prev) => [
          {
            id: Date.now().toString(),
            text: textToSend,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            withEnter: appendEnter,
          },
          ...prev.slice(0, 9), // keep last 10
        ]);
      }

      if (appendEnter) {
        setTimeout(() => {
          sendPacket({ type: 'key_press', key: 'enter' });
        }, 60);
      }

      setBufferText('');
    },
    [triggerHaptic, sendPacket]
  );

  // Live real-time typing / dictation stream
  const handleLiveTextChange = useCallback(
    (newText: string) => {
      if (!liveStreamMode) {
        setBufferText(newText);
        return;
      }

      if (newText.length > bufferText.length) {
        const added = newText.slice(bufferText.length);
        triggerHaptic();
        sendPacket({
          type: 'type_text',
          text: added,
        });
      } else if (newText.length < bufferText.length) {
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
    },
    [bufferText, liveStreamMode, triggerHaptic, sendPacket]
  );

  // Quick single keypress / shortcut
  const handleKeyAction = useCallback(
    (keyOrShortcut: string | string[]) => {
      triggerHaptic();
      if (Array.isArray(keyOrShortcut)) {
        sendPacket({ type: 'shortcut', keys: keyOrShortcut });
      } else {
        sendPacket({ type: 'key_press', key: keyOrShortcut });
      }
    },
    [triggerHaptic, sendPacket]
  );

  // Calculate metrics
  const charCount = bufferText.length;
  const wordCount = bufferText.trim() === '' ? 0 : bufferText.trim().split(/\s+/).length;

  const snippetCategories = {
    dev: ['git status', 'git pull', 'git push', 'npm run start', 'npm run dev', 'cls', 'dir', 'cd ..', 'python app.py', 'docker ps'],
    phrases: ['Thank you!', 'Confirmed, thank you.', 'Looking into this now.', 'Please review when possible.', 'LGTM 👍', 'All checks passed.'],
    symbols: ['->', '=>', '{ }', '[ ]', '<!-- -->', '===', '!==', '&&', '||', '${ }'],
  };

  return (
    <SafeAreaView style={styles.safeContainer} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="light-content" />

      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.brandIconWrapper}>
            <Text style={styles.brandIcon}>🎙️</Text>
          </View>
          <View>
            <Text style={styles.brandTitle}>VOICE & TEXT BRIDGE</Text>
            <Text style={styles.brandSubtitle}>ADB Laptop Remote Keyboard</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {/* Status Badge */}
          <View
            style={[
              styles.statusPill,
              connectionStatus === 'connected'
                ? styles.statusPillOnline
                : connectionStatus === 'connecting'
                ? styles.statusPillConnecting
                : styles.statusPillOffline,
            ]}
          >
            <Animated.View
              style={[
                styles.statusDot,
                connectionStatus === 'connected'
                  ? styles.dotOnline
                  : connectionStatus === 'connecting'
                  ? styles.dotConnecting
                  : styles.dotOffline,
                connectionStatus === 'connected' && { opacity: pulseAnim },
              ]}
            />
            <Text
              style={[
                styles.statusText,
                connectionStatus === 'connected'
                  ? styles.textOnline
                  : connectionStatus === 'connecting'
                  ? styles.textConnecting
                  : styles.textOffline,
              ]}
            >
              {connectionStatus === 'connected'
                ? `ONLINE ${latency !== null ? `(${latency}ms)` : ''}`
                : connectionStatus === 'connecting'
                ? 'CONNECTING'
                : 'OFFLINE'}
            </Text>
          </View>

          {/* Quick Settings Icon */}
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setIsSettingsOpen(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.iconButtonText}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flexOne}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flexOne}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Transmission Mode Segmented Control */}
          <View style={styles.modeSelectorCard}>
            <TouchableOpacity
              style={[
                styles.modeOption,
                !liveStreamMode && styles.modeOptionActiveDraft,
              ]}
              onPress={() => {
                triggerHaptic();
                setLiveStreamMode(false);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.modeIcon}>📥</Text>
              <View>
                <Text
                  style={[
                    styles.modeTitle,
                    !liveStreamMode && styles.modeTitleActiveDraft,
                  ]}
                >
                  Draft & Send
                </Text>
                <Text style={styles.modeDesc}>Dictate / paste, edit, then transmit</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modeOption,
                liveStreamMode && styles.modeOptionActiveLive,
              ]}
              onPress={() => {
                triggerHaptic();
                setLiveStreamMode(true);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.modeIcon}>⚡</Text>
              <View>
                <Text
                  style={[
                    styles.modeTitle,
                    liveStreamMode && styles.modeTitleActiveLive,
                  ]}
                >
                  Live Stream
                </Text>
                <Text style={styles.modeDesc}>Streams characters in real-time</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Voice Dictation Instruction Banner */}
          <View style={styles.voiceTipBanner}>
            <View style={styles.micCircle}>
              <Text style={styles.micEmoji}>🎤</Text>
            </View>
            <View style={styles.voiceTipContent}>
              <Text style={styles.voiceTipTitle}>Voice Typing Tip</Text>
              <Text style={styles.voiceTipText}>
                Tap the input area, then press the <Text style={styles.boldWhite}>🎙️ microphone</Text> key on your phone keyboard (Gboard/Samsung) to speak directly to your laptop!
              </Text>
            </View>
          </View>

          {/* Hero Input Card */}
          <View
            style={[
              styles.inputCard,
              isFocused && styles.inputCardFocused,
              liveStreamMode && styles.inputCardLive,
            ]}
          >
            {/* Input Card Header Toolbar */}
            <View style={styles.inputCardHeader}>
              <View style={styles.metricsBadge}>
                <Text style={styles.metricsText}>
                  {charCount} chars · {wordCount} words
                </Text>
              </View>

              <View style={styles.cardHeaderActions}>
                {bufferText.length > 0 && (
                  <TouchableOpacity
                    style={styles.cardActionBtn}
                    onPress={() => {
                      triggerHaptic();
                      setBufferText('');
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.cardActionBtnText}>🗑 Clear</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.cardActionBtn}
                  onPress={() => setIsGuideOpen(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cardActionBtnText}>📖 ADB Setup</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Multiline TextInput */}
            <TextInput
              ref={inputRef}
              style={styles.mainTextInput}
              multiline
              placeholder={
                liveStreamMode
                  ? '⚡ Live streaming mode active...\nType or speak; characters flow straight to your laptop.'
                  : 'Type, paste, or speak freely here...\n\nTap the microphone on your phone keyboard to dictate effortlessly.'
              }
              placeholderTextColor="#475569"
              value={bufferText}
              onChangeText={handleLiveTextChange}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {/* Bottom Actions inside Card */}
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  styles.sendBufferButton,
                  bufferText.trim().length === 0 && styles.buttonDisabled,
                ]}
                onPress={() => handleSendBuffer(bufferText, false)}
                disabled={bufferText.trim().length === 0}
                activeOpacity={0.8}
              >
                <Text style={styles.sendButtonText}>➤  SEND TEXT</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.sendButton,
                  styles.sendEnterButton,
                  bufferText.trim().length === 0 && styles.buttonDisabled,
                ]}
                onPress={() => handleSendBuffer(bufferText, true)}
                disabled={bufferText.trim().length === 0}
                activeOpacity={0.8}
              >
                <Text style={styles.sendButtonText}>↵  SEND + ENTER</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Quick Hardware Keys Toolbar */}
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>QUICK HARDWARE CONTROLS</Text>
            <View style={styles.quickKeysGrid}>
              <TouchableOpacity
                style={[styles.quickKey, styles.keyEnter]}
                onPress={() => handleKeyAction('enter')}
                activeOpacity={0.7}
              >
                <Text style={[styles.quickKeyText, styles.textTeal]}>↵ Enter</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.quickKey, styles.keyBack]}
                onPress={() => handleKeyAction('backspace')}
                activeOpacity={0.7}
              >
                <Text style={[styles.quickKeyText, styles.textAmber]}>⌫ Backspace</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickKey}
                onPress={() => handleKeyAction('tab')}
                activeOpacity={0.7}
              >
                <Text style={styles.quickKeyText}>⇥ Tab</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickKey}
                onPress={() => handleKeyAction('space')}
                activeOpacity={0.7}
              >
                <Text style={styles.quickKeyText}>␣ Space</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickKey}
                onPress={() => handleKeyAction(['ctrl', 'v'])}
                activeOpacity={0.7}
              >
                <Text style={[styles.quickKeyText, styles.textSky]}>📋 Paste PC</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickKey}
                onPress={() => handleKeyAction(['win', 'v'])}
                activeOpacity={0.7}
              >
                <Text style={[styles.quickKeyText, styles.textPurple]}>📑 Win + V</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickKey}
                onPress={() => handleKeyAction(['ctrl', 'z'])}
                activeOpacity={0.7}
              >
                <Text style={styles.quickKeyText}>↩ Undo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickKey}
                onPress={() => handleKeyAction('escape')}
                activeOpacity={0.7}
              >
                <Text style={styles.quickKeyText}>Esc</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Quick Snippets & Presets */}
          <View style={styles.sectionContainer}>
            <View style={styles.snippetHeaderRow}>
              <Text style={styles.sectionTitle}>ONE-TAP SNIPPETS</Text>
              <View style={styles.snippetTabs}>
                {(['dev', 'phrases', 'symbols'] as const).map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.snippetTab,
                      activeSnippetCategory === cat && styles.snippetTabActive,
                    ]}
                    onPress={() => setActiveSnippetCategory(cat)}
                  >
                    <Text
                      style={[
                        styles.snippetTabText,
                        activeSnippetCategory === cat && styles.snippetTabTextActive,
                      ]}
                    >
                      {cat.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsScroll}
            >
              {snippetCategories[activeSnippetCategory].map((snippet) => (
                <TouchableOpacity
                  key={snippet}
                  style={styles.chipButton}
                  onPress={() => {
                    triggerHaptic();
                    handleSendBuffer(snippet, true);
                  }}
                  onLongPress={() => {
                    triggerHaptic();
                    setBufferText((prev) => (prev ? prev + ' ' + snippet : snippet));
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.chipButtonText}>{snippet}</Text>
                  <Text style={styles.chipArrow}>↵</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.chipHint}>Tap to send + enter instantly · Long-press to insert into box</Text>
          </View>

          {/* Recent Transmission History */}
          {sentHistory.length > 0 && (
            <View style={styles.sectionContainer}>
              <View style={styles.historyHeader}>
                <Text style={styles.sectionTitle}>RECENT TRANSMISSIONS</Text>
                <TouchableOpacity
                  onPress={() => setSentHistory([])}
                  activeOpacity={0.7}
                >
                  <Text style={styles.historyClear}>Clear</Text>
                </TouchableOpacity>
              </View>

              {sentHistory.slice(0, 5).map((item) => (
                <View key={item.id} style={styles.historyItem}>
                  <View style={styles.historyTextCol}>
                    <Text style={styles.historySnippet} numberOfLines={2}>
                      {item.text}
                    </Text>
                    <Text style={styles.historyMeta}>
                      {item.timestamp} {item.withEnter ? '· with Enter ↵' : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.resendBtn}
                    onPress={() => handleSendBuffer(item.text, item.withEnter)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.resendBtnText}>Re-send</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Settings Modal */}
      <Modal visible={isSettingsOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Connection Settings</Text>
              <TouchableOpacity onPress={() => setIsSettingsOpen(false)}>
                <Text style={styles.modalCloseIcon}>✕</Text>
              </TouchableOpacity>
            </View>

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
              activeOpacity={0.7}
            >
              <View>
                <Text style={styles.toggleLabel}>Vibration Feedback</Text>
                <Text style={styles.toggleSub}>Haptic tick on typing & buttons</Text>
              </View>
              <View style={[styles.switchTrack, hapticEnabled && styles.switchTrackActive]}>
                <View style={[styles.switchThumb, hapticEnabled && styles.switchThumbActive]} />
              </View>
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
                <Text style={styles.modalCloseBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ADB Guide Modal */}
      <Modal visible={isGuideOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>ADB Connection Guide</Text>
              <TouchableOpacity onPress={() => setIsGuideOpen(false)}>
                <Text style={styles.modalCloseIcon}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.guideScroll}>
              <Text style={styles.guideStep}>1. Plug USB Cable into Laptop</Text>
              <Text style={styles.guideDesc}>
                Connect phone to your PC. Ensure "USB Debugging" is enabled in phone Developer Options.
              </Text>

              <Text style={styles.guideStep}>2. Start Desktop Companion</Text>
              <Text style={styles.guideDesc}>
                On your PC, double-click:
              </Text>
              <View style={styles.codeSnippet}>
                <Text style={styles.codeText}>ADBKeyboardCompanion.exe</Text>
              </View>
              <Text style={styles.guideDesc}>
                Or run batch script:
              </Text>
              <View style={styles.codeSnippet}>
                <Text style={styles.codeText}>start-companion.bat</Text>
              </View>

              <Text style={styles.guideStep}>3. Instant USB Tunneling</Text>
              <Text style={styles.guideDesc}>
                Traffic is routed through <Text style={styles.boldWhite}>localhost:8080</Text> via ADB reverse. Zero Wi-Fi needed, ultra-fast 5ms latency!
              </Text>
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalActionBtn, styles.modalSaveBtn, styles.modalBtnMargin]}
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

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: '#070b14',
  },
  flexOne: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    backgroundColor: '#0f172a',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  brandIcon: {
    fontSize: 18,
  },
  brandTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  brandSubtitle: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '500',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusPillOnline: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  statusPillConnecting: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  statusPillOffline: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 6,
  },
  dotOnline: {
    backgroundColor: '#10b981',
  },
  dotConnecting: {
    backgroundColor: '#f59e0b',
  },
  dotOffline: {
    backgroundColor: '#ef4444',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  textOnline: {
    color: '#10b981',
  },
  textConnecting: {
    color: '#f59e0b',
  },
  textOffline: {
    color: '#ef4444',
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  iconButtonText: {
    fontSize: 14,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  modeSelectorCard: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  modeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#0f172a',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#1e293b',
  },
  modeOptionActiveDraft: {
    backgroundColor: 'rgba(2, 132, 199, 0.15)',
    borderColor: '#38bdf8',
  },
  modeOptionActiveLive: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: '#f59e0b',
  },
  modeIcon: {
    fontSize: 20,
  },
  modeTitle: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '700',
  },
  modeTitleActiveDraft: {
    color: '#38bdf8',
  },
  modeTitleActiveLive: {
    color: '#f59e0b',
  },
  modeDesc: {
    color: '#64748b',
    fontSize: 10,
    marginTop: 2,
  },
  voiceTipBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 14,
  },
  micCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#0284c7',
  },
  micEmoji: {
    fontSize: 18,
  },
  voiceTipContent: {
    flex: 1,
  },
  voiceTipTitle: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
  },
  voiceTipText: {
    color: '#94a3b8',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  boldWhite: {
    color: '#f8fafc',
    fontWeight: '700',
  },
  inputCard: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#1e293b',
    padding: 14,
    marginBottom: 16,
    elevation: 3,
  },
  inputCardFocused: {
    borderColor: '#38bdf8',
    shadowColor: '#38bdf8',
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  inputCardLive: {
    borderColor: '#f59e0b',
  },
  inputCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  metricsBadge: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  metricsText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
  },
  cardHeaderActions: {
    flexDirection: 'row',
    gap: 8,
  },
  cardActionBtn: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardActionBtnText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  mainTextInput: {
    color: '#f8fafc',
    fontSize: 16,
    lineHeight: 24,
    minHeight: 150,
    maxHeight: 280,
    textAlignVertical: 'top',
    padding: 8,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  sendButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  sendBufferButton: {
    backgroundColor: '#0284c7',
  },
  sendEnterButton: {
    backgroundColor: '#059669',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  sectionContainer: {
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 10,
  },
  quickKeysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickKey: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    minWidth: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyEnter: {
    borderColor: '#059669',
  },
  keyBack: {
    borderColor: '#b45309',
  },
  quickKeyText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '700',
  },
  textTeal: {
    color: '#34d399',
  },
  textAmber: {
    color: '#fbbf24',
  },
  textSky: {
    color: '#38bdf8',
  },
  textPurple: {
    color: '#c084fc',
  },
  snippetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  snippetTabs: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  snippetTab: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  snippetTabActive: {
    backgroundColor: '#1e293b',
  },
  snippetTabText: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700',
  },
  snippetTabTextActive: {
    color: '#38bdf8',
  },
  chipsScroll: {
    gap: 8,
    paddingBottom: 4,
  },
  chipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0f172a',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  chipButtonText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  chipArrow: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
  },
  chipHint: {
    color: '#475569',
    fontSize: 10,
    marginTop: 6,
    fontStyle: 'italic',
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  historyClear: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 6,
  },
  historyTextCol: {
    flex: 1,
    marginRight: 10,
  },
  historySnippet: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '500',
  },
  historyMeta: {
    color: '#64748b',
    fontSize: 10,
    marginTop: 3,
  },
  resendBtn: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  resendBtnText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  bottomSpacer: {
    height: 30,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    color: '#38bdf8',
    fontSize: 17,
    fontWeight: '800',
  },
  modalCloseIcon: {
    color: '#64748b',
    fontSize: 18,
    fontWeight: '700',
  },
  inputLabel: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 6,
    marginTop: 8,
  },
  modalInput: {
    backgroundColor: '#1e293b',
    color: '#ffffff',
    borderRadius: 8,
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
    fontWeight: '600',
  },
  toggleSub: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  switchTrack: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#334155',
    padding: 2,
  },
  switchTrackActive: {
    backgroundColor: '#0284c7',
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ffffff',
  },
  switchThumbActive: {
    alignSelf: 'flex-end',
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
    backgroundColor: '#1e293b',
  },
  modalActionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  modalCloseBtnText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  modalBtnMargin: {
    marginTop: 16,
  },
  guideScroll: {
    maxHeight: 320,
  },
  guideStep: {
    color: '#f8fafc',
    fontSize: 13,
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
    padding: 8,
    borderRadius: 6,
    marginVertical: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#38bdf8',
  },
  codeText: {
    color: '#38bdf8',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
  },
});
