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
  Easing,
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
  // Connection state
  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState('8080');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionState>('disconnected');
  const [latency, setLatency] = useState<number | null>(null);
  const [hapticEnabled, setHapticEnabled] = useState(true);

  // Editor & Mode state
  const [bufferText, setBufferText] = useState('');
  const [liveStreamMode, setLiveStreamMode] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [sentHistory, setSentHistory] = useState<SentItem[]>([]);
  const [activeSnippetTab, setActiveSnippetTab] = useState<'terminal' | 'text' | 'code'>('terminal');

  // Animation values
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const waveBars = useRef([
    new Animated.Value(0.3),
    new Animated.Value(0.7),
    new Animated.Value(1.0),
    new Animated.Value(0.5),
    new Animated.Value(0.8),
    new Animated.Value(0.4),
    new Animated.Value(0.6),
  ]).current;

  const inputRef = useRef<TextInput>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<any>(null);
  const reconnectTimeoutRef = useRef<any>(null);

  // Pulsing connection dot
  useEffect(() => {
    if (connectionStatus === 'connected') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.35,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 900,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [connectionStatus, pulseAnim]);

  // Subtle telemetry waveform animation (Industrial audio indicator)
  useEffect(() => {
    const anims = waveBars.map((bar, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(bar, {
            toValue: 0.2 + (i % 3) * 0.35,
            duration: 600 + i * 120,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(bar, {
            toValue: 0.8 + ((i + 1) % 3) * 0.1,
            duration: 600 + i * 120,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
        ])
      )
    );

    anims.forEach((anim) => anim.start());
    return () => anims.forEach((anim) => anim.stop());
  }, [waveBars]);

  // Tactile haptic feedback
  const triggerHaptic = useCallback(() => {
    if (hapticEnabled) {
      try {
        Vibration.vibrate(8);
      } catch {
        // Silently ignore
      }
    }
  }, [hapticEnabled]);

  // Transmit payload to desktop server
  const sendPacket = useCallback((payload: any) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
    }
  }, []);

  // WebSocket connection & auto-reconnect
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

  // Transmit buffer
  const handleSendBuffer = useCallback(
    (textToSend: string, appendEnter: boolean = false) => {
      if (!textToSend && !appendEnter) return;
      triggerHaptic();

      if (textToSend) {
        sendPacket({
          type: 'type_text',
          text: textToSend,
        });

        setSentHistory((prev) => [
          {
            id: Date.now().toString(),
            text: textToSend,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            withEnter: appendEnter,
          },
          ...prev.slice(0, 9),
        ]);
      }

      if (appendEnter) {
        setTimeout(() => {
          sendPacket({ type: 'key_press', key: 'enter' });
        }, 50);
      }

      setBufferText('');
    },
    [triggerHaptic, sendPacket]
  );

  // Live real-time streaming
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

  // Direct keystroke action
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

  const charCount = bufferText.length;
  const wordCount = bufferText.trim() === '' ? 0 : bufferText.trim().split(/\s+/).length;

  const snippets = {
    terminal: ['git status', 'git pull', 'git push', 'npm run dev', 'cls', 'python app.py', 'docker ps'],
    text: ['Thank you.', 'Confirmed.', 'Looking into this now.', 'Please review.', 'LGTM.'],
    code: ['const ', 'return ', 'console.log(', '() => ', '===', '!==', 'async/await'],
  };

  return (
    <SafeAreaView style={styles.safeContainer} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="light-content" />

      {/* Industrial Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.brandTitle}>FLOW</Text>
          <Text style={styles.brandDivider}>/</Text>
          <Text style={styles.brandSubtitle}>ADB LINK</Text>
        </View>

        <View style={styles.headerRight}>
          {/* Minimal Telemetry Status Pill */}
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
                ? `LINKED · ${latency !== null ? `${latency}MS` : 'OK'}`
                : connectionStatus === 'connecting'
                ? 'CONNECTING'
                : 'OFFLINE'}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setIsSettingsOpen(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.iconButtonGlyph}>⚙</Text>
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
          {/* Precision Mode Selector & Audio Telemetry Bar */}
          <View style={styles.controlDeck}>
            <View style={styles.modeSegment}>
              <TouchableOpacity
                style={[
                  styles.modeButton,
                  !liveStreamMode && styles.modeButtonActive,
                ]}
                onPress={() => {
                  triggerHaptic();
                  setLiveStreamMode(false);
                }}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.modeButtonText,
                    !liveStreamMode && styles.modeButtonTextActive,
                  ]}
                >
                  BUFFER
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modeButton,
                  liveStreamMode && styles.modeButtonActiveOrange,
                ]}
                onPress={() => {
                  triggerHaptic();
                  setLiveStreamMode(true);
                }}
                activeOpacity={0.8}
              >
                <View style={styles.streamLabelRow}>
                  {liveStreamMode && <View style={styles.liveIndicatorDot} />}
                  <Text
                    style={[
                      styles.modeButtonText,
                      liveStreamMode && styles.modeButtonTextActiveOrange,
                    ]}
                  >
                    REAL-TIME
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Audio Waveform Telemetry Visualizer */}
            <View style={styles.waveContainer}>
              {waveBars.map((barAnim, index) => {
                const heightInterpolated = barAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [4, 18],
                });
                return (
                  <Animated.View
                    key={index}
                    style={[
                      styles.waveBar,
                      liveStreamMode && styles.waveBarOrange,
                      { height: heightInterpolated },
                    ]}
                  />
                );
              })}
            </View>
          </View>

          {/* Minimal Dictation Surface */}
          <View
            style={[
              styles.editorSurface,
              isFocused && styles.editorSurfaceFocused,
              liveStreamMode && styles.editorSurfaceLive,
            ]}
          >
            <View style={styles.editorMetaBar}>
              <Text style={styles.metaReadout}>
                {charCount} CHARS · {wordCount} WORDS
              </Text>
              <View style={styles.editorActionsRow}>
                {bufferText.length > 0 && (
                  <TouchableOpacity
                    style={styles.tinyActionBtn}
                    onPress={() => {
                      triggerHaptic();
                      setBufferText('');
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.tinyActionText}>CLEAR</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.tinyActionBtn}
                  onPress={() => setIsGuideOpen(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.tinyActionText}>HELP</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TextInput
              ref={inputRef}
              style={styles.editorInput}
              multiline
              placeholder={
                liveStreamMode
                  ? 'Real-time transmission armed.\nType or speak into your keyboard microphone to stream characters directly to your PC screen.'
                  : 'Compose or speak here...\n\nTap the microphone on your mobile keyboard to dictate freely, then transmit.'
              }
              placeholderTextColor="#3E424B"
              value={bufferText}
              onChangeText={handleLiveTextChange}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {/* Primary Action Buttons */}
            <View style={styles.actionDock}>
              <TouchableOpacity
                style={[
                  styles.primaryTransmitBtn,
                  bufferText.trim().length === 0 && styles.btnDisabled,
                ]}
                onPress={() => handleSendBuffer(bufferText, false)}
                disabled={bufferText.trim().length === 0}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryTransmitText}>TRANSMIT</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.secondaryTransmitBtn,
                  bufferText.trim().length === 0 && styles.btnDisabled,
                ]}
                onPress={() => handleSendBuffer(bufferText, true)}
                disabled={bufferText.trim().length === 0}
                activeOpacity={0.85}
              >
                <Text style={styles.secondaryTransmitText}>TRANSMIT + ↵</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Tactical Hardware Keypad */}
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionLabel}>TACTICAL CONTROLS</Text>
            <View style={styles.tactileGrid}>
              <TouchableOpacity
                style={[styles.tactileTile, styles.tileEnter]}
                onPress={() => handleKeyAction('enter')}
                activeOpacity={0.65}
              >
                <Text style={styles.tileTextActive}>↵ ENTER</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.tactileTile}
                onPress={() => handleKeyAction('backspace')}
                activeOpacity={0.65}
              >
                <Text style={styles.tileText}>⌫ BACK</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.tactileTile}
                onPress={() => handleKeyAction('tab')}
                activeOpacity={0.65}
              >
                <Text style={styles.tileText}>⇥ TAB</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.tactileTile}
                onPress={() => handleKeyAction('space')}
                activeOpacity={0.65}
              >
                <Text style={styles.tileText}>␣ SPACE</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.tactileTile}
                onPress={() => handleKeyAction(['ctrl', 'v'])}
                activeOpacity={0.65}
              >
                <Text style={styles.tileText}>PASTE (PC)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.tactileTile}
                onPress={() => handleKeyAction(['win', 'v'])}
                activeOpacity={0.65}
              >
                <Text style={styles.tileText}>WIN + V</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.tactileTile}
                onPress={() => handleKeyAction(['ctrl', 'z'])}
                activeOpacity={0.65}
              >
                <Text style={styles.tileText}>UNDO</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.tactileTile}
                onPress={() => handleKeyAction('escape')}
                activeOpacity={0.65}
              >
                <Text style={styles.tileText}>ESC</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Precision Presets */}
          <View style={styles.sectionWrap}>
            <View style={styles.snippetHeaderRow}>
              <Text style={styles.sectionLabel}>SNIPPETS</Text>
              <View style={styles.tabSelector}>
                {(['terminal', 'text', 'code'] as const).map((tab) => (
                  <TouchableOpacity
                    key={tab}
                    style={[
                      styles.tabItem,
                      activeSnippetTab === tab && styles.tabItemActive,
                    ]}
                    onPress={() => {
                      triggerHaptic();
                      setActiveSnippetTab(tab);
                    }}
                  >
                    <Text
                      style={[
                        styles.tabItemText,
                        activeSnippetTab === tab && styles.tabItemTextActive,
                      ]}
                    >
                      {tab.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}
            >
              {snippets[activeSnippetTab].map((snippet) => (
                <TouchableOpacity
                  key={snippet}
                  style={styles.chipTile}
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
                  <Text style={styles.chipTileText}>{snippet}</Text>
                  <Text style={styles.chipTileArrow}>↵</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Transmission Log / Recent */}
          {sentHistory.length > 0 && (
            <View style={styles.sectionWrap}>
              <View style={styles.snippetHeaderRow}>
                <Text style={styles.sectionLabel}>TRANSMISSION LOG</Text>
                <TouchableOpacity
                  onPress={() => setSentHistory([])}
                  activeOpacity={0.7}
                >
                  <Text style={styles.clearHistoryText}>CLEAR</Text>
                </TouchableOpacity>
              </View>

              {sentHistory.slice(0, 4).map((item) => (
                <View key={item.id} style={styles.historyCard}>
                  <View style={styles.historyContent}>
                    <Text style={styles.historyText} numberOfLines={2}>
                      {item.text}
                    </Text>
                    <Text style={styles.historyMetaText}>
                      {item.timestamp} {item.withEnter ? '· ENTER' : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.repeatBtn}
                    onPress={() => handleSendBuffer(item.text, item.withEnter)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.repeatBtnText}>RESEND</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Settings Modal */}
      <Modal visible={isSettingsOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeading}>CONFIGURATION</Text>
              <TouchableOpacity
                onPress={() => setIsSettingsOpen(false)}
                style={styles.modalCloseBtn}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>HOST ADDRESS</Text>
            <TextInput
              style={styles.fieldInput}
              value={host}
              onChangeText={setHost}
              placeholder="127.0.0.1"
              placeholderTextColor="#475569"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.fieldLabel}>PORT</Text>
            <TextInput
              style={styles.fieldInput}
              value={port}
              onChangeText={setPort}
              keyboardType="numeric"
              placeholder="8080"
              placeholderTextColor="#475569"
            />

            <TouchableOpacity
              style={styles.switchRow}
              onPress={() => setHapticEnabled(!hapticEnabled)}
              activeOpacity={0.7}
            >
              <View>
                <Text style={styles.switchLabel}>TACTILE HAPTICS</Text>
                <Text style={styles.switchSub}>Micro-vibrations on keystroke actuation</Text>
              </View>
              <View style={[styles.switchPill, hapticEnabled && styles.switchPillActive]}>
                <View style={[styles.switchDot, hapticEnabled && styles.switchDotActive]} />
              </View>
            </TouchableOpacity>

            <View style={styles.modalFooterRow}>
              <TouchableOpacity
                style={styles.modalSaveButton}
                onPress={() => {
                  setIsSettingsOpen(false);
                  connectToServer();
                }}
              >
                <Text style={styles.modalSaveButtonText}>APPLY & CONNECT</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setIsSettingsOpen(false)}
              >
                <Text style={styles.modalCancelButtonText}>CLOSE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Guide Modal */}
      <Modal visible={isGuideOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeading}>SETUP // USB ADB</Text>
              <TouchableOpacity
                onPress={() => setIsGuideOpen(false)}
                style={styles.modalCloseBtn}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              <Text style={styles.guideStepNum}>01 // PHYSICAL LINK</Text>
              <Text style={styles.guideBody}>
                Connect device via USB. Verify USB Debugging is authorized in Developer Options.
              </Text>

              <Text style={styles.guideStepNum}>02 // HOST COMPANION</Text>
              <Text style={styles.guideBody}>
                Launch Desktop Companion on your Windows PC:
              </Text>
              <View style={styles.terminalBox}>
                <Text style={styles.terminalText}>ADBKeyboardCompanion.exe</Text>
              </View>

              <Text style={styles.guideStepNum}>03 // DIRECT PORT TUNNEL</Text>
              <Text style={styles.guideBody}>
                Communication operates through localhost:8080 via ADB reverse. Zero cloud dependency, ultra-low 5ms latency.
              </Text>
            </ScrollView>

            <TouchableOpacity
              style={styles.modalSaveButton}
              onPress={() => setIsGuideOpen(false)}
            >
              <Text style={styles.modalSaveButtonText}>DISMISS</Text>
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
    backgroundColor: '#08090A',
  },
  flexOne: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.07)',
    backgroundColor: '#0C0D0E',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandTitle: {
    color: '#F7F8F8',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  brandDivider: {
    color: '#3E424B',
    fontSize: 14,
    fontWeight: '400',
  },
  brandSubtitle: {
    color: '#8A8F98',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
  },
  statusPillOnline: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  statusPillConnecting: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  statusPillOffline: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  dotOnline: {
    backgroundColor: '#10B981',
  },
  dotConnecting: {
    backgroundColor: '#F59E0B',
  },
  dotOffline: {
    backgroundColor: '#EF4444',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  textOnline: {
    color: '#10B981',
  },
  textConnecting: {
    color: '#F59E0B',
  },
  textOffline: {
    color: '#EF4444',
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 4,
    backgroundColor: '#141517',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  iconButtonGlyph: {
    color: '#8A8F98',
    fontSize: 14,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  controlDeck: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#111214',
    padding: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 12,
  },
  modeSegment: {
    flexDirection: 'row',
    gap: 4,
  },
  modeButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 4,
    backgroundColor: 'transparent',
  },
  modeButtonActive: {
    backgroundColor: '#202226',
  },
  modeButtonActiveOrange: {
    backgroundColor: 'rgba(255, 85, 0, 0.14)',
  },
  modeButtonText: {
    color: '#626773',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  modeButtonTextActive: {
    color: '#F7F8F8',
  },
  modeButtonTextActiveOrange: {
    color: '#FF5500',
  },
  streamLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF5500',
  },
  waveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 12,
    height: 24,
  },
  waveBar: {
    width: 2,
    backgroundColor: '#4E535E',
    borderRadius: 1,
  },
  waveBarOrange: {
    backgroundColor: '#FF5500',
  },
  editorSurface: {
    backgroundColor: '#101113',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 14,
    marginBottom: 16,
  },
  editorSurfaceFocused: {
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  editorSurfaceLive: {
    borderColor: 'rgba(255, 85, 0, 0.4)',
  },
  editorMetaBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 10,
  },
  metaReadout: {
    color: '#555962',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  editorActionsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  tinyActionBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
    backgroundColor: '#18191B',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  tinyActionText: {
    color: '#8A8F98',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  editorInput: {
    color: '#F7F8F8',
    fontSize: 16,
    lineHeight: 24,
    minHeight: 160,
    maxHeight: 280,
    textAlignVertical: 'top',
    padding: 0,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  actionDock: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  primaryTransmitBtn: {
    flex: 1.2,
    backgroundColor: '#F7F8F8',
    paddingVertical: 14,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryTransmitText: {
    color: '#08090A',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  secondaryTransmitBtn: {
    flex: 1,
    backgroundColor: '#1A1C1E',
    paddingVertical: 14,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  secondaryTransmitText: {
    color: '#F7F8F8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  btnDisabled: {
    opacity: 0.25,
  },
  sectionWrap: {
    marginBottom: 16,
  },
  sectionLabel: {
    color: '#555962',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  tactileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tactileTile: {
    flexBasis: '23%',
    flexGrow: 1,
    backgroundColor: '#121315',
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileEnter: {
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  tileText: {
    color: '#8A8F98',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  tileTextActive: {
    color: '#F7F8F8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  snippetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tabSelector: {
    flexDirection: 'row',
    backgroundColor: '#121315',
    borderRadius: 4,
    padding: 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  tabItem: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 3,
  },
  tabItemActive: {
    backgroundColor: '#202226',
  },
  tabItemText: {
    color: '#555962',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  tabItemTextActive: {
    color: '#F7F8F8',
  },
  chipsRow: {
    gap: 6,
    paddingBottom: 4,
  },
  chipTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#121315',
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  chipTileText: {
    color: '#C6CAD0',
    fontSize: 11,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  chipTileArrow: {
    color: '#555962',
    fontSize: 10,
    fontWeight: '700',
  },
  clearHistoryText: {
    color: '#555962',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111214',
    padding: 10,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 6,
  },
  historyContent: {
    flex: 1,
    marginRight: 12,
  },
  historyText: {
    color: '#D4D7DC',
    fontSize: 12,
    lineHeight: 17,
  },
  historyMetaText: {
    color: '#555962',
    fontSize: 9,
    marginTop: 3,
    letterSpacing: 0.8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  repeatBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 3,
    backgroundColor: '#1A1C1E',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  repeatBtnText: {
    color: '#8A8F98',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  bottomSpacer: {
    height: 30,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    justifyContent: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: '#101113',
    borderRadius: 8,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  modalHeading: {
    color: '#F7F8F8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalCloseText: {
    color: '#626773',
    fontSize: 14,
  },
  fieldLabel: {
    color: '#626773',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  fieldInput: {
    backgroundColor: '#16171A',
    color: '#F7F8F8',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  switchLabel: {
    color: '#F7F8F8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  switchSub: {
    color: '#555962',
    fontSize: 10,
    marginTop: 2,
  },
  switchPill: {
    width: 38,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#202226',
    padding: 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  switchPillActive: {
    backgroundColor: '#F7F8F8',
  },
  switchDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#555962',
  },
  switchDotActive: {
    alignSelf: 'flex-end',
    backgroundColor: '#08090A',
  },
  modalFooterRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  modalSaveButton: {
    flex: 1,
    backgroundColor: '#F7F8F8',
    paddingVertical: 12,
    borderRadius: 4,
    alignItems: 'center',
  },
  modalSaveButtonText: {
    color: '#08090A',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  modalCancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 4,
    backgroundColor: '#16171A',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
  },
  modalCancelButtonText: {
    color: '#8A8F98',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  modalScroll: {
    maxHeight: 280,
    marginBottom: 16,
  },
  guideStepNum: {
    color: '#FF5500',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: 12,
    marginBottom: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  guideBody: {
    color: '#8A8F98',
    fontSize: 12,
    lineHeight: 18,
  },
  terminalBox: {
    backgroundColor: '#08090A',
    padding: 8,
    borderRadius: 4,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  terminalText: {
    color: '#F7F8F8',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
  },
});
