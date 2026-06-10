import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  Pressable,
  Alert,
  Dimensions,
  Share,
  type ImageStyle,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  FadeIn,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/lib/api';
import { greetingFirstName } from '../../src/lib/userDisplayName';
import { useAuthStore } from '../../src/store/authStore';
import { Chip, ChatRichText, TrainingPlanCard } from '../../src/components';
import { isNonPremiumTier } from '../../src/lib/planAiPremiumGate';
import { showPremiumLock } from '../../src/lib/premiumLock';
import { toUserFacingErrorMessage } from '../../src/lib/userFacingError';
import {
  colors,
  spacing,
  typography,
  borderRadius,
  screenPaddingX,
  iconSize,
  DOCK_H,
  DOCK_MARGIN_BOTTOM,
  platformBoxShadow,
  authFotoGradientColors,
  authFotoGradientLocations,
} from '../../src/theme';
import { ChatMessage, Profile, TrainingPlan } from '../../src/types';
import type { WorkoutRoutine } from '../../src/types/workout';
import { useDebouncedKeyboardOpen } from '../../src/hooks/useDebouncedKeyboardOpen';
import { useChatInputKeyboardOffset } from '../../src/hooks/useChatInputKeyboardOffset';
import { useKeyboardScreenDebug } from '../../src/lib/keyboardDebug';

const CHAT_BG = require('../../assets/images/chat-bg.jpg');
/** Nutria + bocadillo (chat con IA / NutriCoach). Mismo asset en cabecera y card vacía. */
const CHAT_AI_COACH_AVATAR = require('../../assets/images/icon-chat-nutri-ai-otter-bubble.png');

const DEFAULT_CHAT_IMAGE_CAPTION = 'Te envío esta imagen para que la revises.';
const CHAT_INPUT_KEYBOARD_GAP = spacing.sm;
const EMPTY_HERO_BORDER = 'rgba(20, 184, 166, 0.38)';
const EMPTY_HERO_GLOW_TOP = 'rgba(16, 185, 129, 0.16)';
const EMPTY_HERO_GLOW_BOTTOM = 'rgba(59, 130, 246, 0.08)';
const EMPTY_HERO_ICON_BG = 'rgba(16, 185, 129, 0.34)';
const EMPTY_HERO_ICON_BORDER = 'rgba(52, 211, 153, 0.16)';
const EMPTY_HERO_BADGE_BG = 'rgba(7, 20, 24, 0.42)';
const EMPTY_HERO_BADGE_BORDER = 'rgba(16, 185, 129, 0.42)';
const EMPTY_HERO_BADGE_TEXT = '#2FFFC4';
const EMPTY_HERO_BODY_TEXT = '#AEB4BC';

interface ChatResponse {
  message: ChatMessage;
  session_id: string;
  actions_taken: string[];
  training_plan?: TrainingPlan;
}

type CoachSavedInsight = {
  id: string;
  body: string;
  source_chat_message_id?: string | null;
  created_at: string;
};

type QuickActionIcon = React.ComponentProps<typeof Ionicons>['name'];

interface QuickAction {
  title: string;
  prompt: string;
  icon: QuickActionIcon;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    title: 'Ideas de comidas',
    prompt: 'Dame tres ideas de comidas faciles para hoy.',
    icon: 'restaurant-outline',
  },
  {
    title: 'Macros y proteina',
    prompt: 'Como puedo subir mi proteina sin complicarme la cocina?',
    icon: 'nutrition-outline',
  },
  {
    title: 'Rutina',
    prompt: 'Hazme una rutina sencilla de 4 dias para empezar.',
    icon: 'barbell-outline',
  },
  {
    title: 'Molestia / readaptación',
    prompt:
      'Tengo molestias en la rodilla (lado derecho), dolor al cargar un 5/10 y en reposo 1/10, sin hinchazón ni chasquido raro. ¿Qué readaptación general me recomiendas?',
    icon: 'medkit-outline',
  },
];

const QUICK_PROMPTS = [
  'Que puedo cenar hoy?',
  'Como mejorar mi ingesta de proteinas?',
  'Alternativas saludables a snacks',
  'Cuanta agua debo tomar?',
];

/** ~4–5× más rápido que 10 ms/carácter: varios caracteres por tick + intervalo corto. */
const TYPEWRITER_DELAY_MS = 5;
const TYPEWRITER_CHARS_PER_TICK = 2;

function trainingPlanToRoutinePayload(plan: TrainingPlan) {
  return {
    name: plan.name || 'Rutina',
    category: 'gym' as const,
    sport_type: null,
    days_per_week: Array.isArray(plan.days) ? plan.days.length : 0,
    days: (plan.days ?? []).map((d, idx) => ({
      weekday: idx % 7,
      label: d.name || `Día ${idx + 1}`,
      display_order: idx,
      exercises: (d.exercises ?? []).map((ex, exIdx) => ({
        name: ex.name || `Ejercicio ${exIdx + 1}`,
        display_order: exIdx,
        default_sets: typeof ex.sets === 'number' ? ex.sets : null,
        default_reps: ex.reps || null,
        notes: null,
      })),
    })),
  };
}

function TypewriterMessage({
  text,
  style,
  onFinish,
}: {
  text: string;
  style: Text['props']['style'];
  onFinish: () => void;
}) {
  const plain = React.useMemo(() => text.replace(/\*\*/g, ''), [text]);
  const [count, setCount] = React.useState(0);
  const doneRef = React.useRef(false);

  React.useEffect(() => {
    if (count >= plain.length) {
      if (!doneRef.current) {
        doneRef.current = true;
        onFinish();
      }
      return;
    }
    const t = setTimeout(
      () => setCount((c) => Math.min(c + TYPEWRITER_CHARS_PER_TICK, plain.length)),
      TYPEWRITER_DELAY_MS,
    );
    return () => clearTimeout(t);
  }, [count, plain.length, onFinish]);

  return <Text style={style}>{plain.slice(0, count)}</Text>;
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const keyboardOpen = useDebouncedKeyboardOpen();
  const { keyboardOffset, safeBottom } = useChatInputKeyboardOffset();
  const queryClient = useQueryClient();
  const trainingPlans = useRef<Record<string, TrainingPlan>>({});
  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const lastListScrollAt = useRef(0);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [savedInsightMessageIds, setSavedInsightMessageIds] = useState<Set<string>>(() => new Set());
  const [savedRoutineMessageIds, setSavedRoutineMessageIds] = useState<Set<string>>(() => new Set());
  const [routineModalAutoMsgId, setRoutineModalAutoMsgId] = useState<string | null>(null);
  const [animatingMsgId, setAnimatingMsgId] = useState<string | null>(null);

  useKeyboardScreenDebug('ChatTab');

  const dockInputBottomPad = useMemo(
    () => Math.max(safeBottom, DOCK_MARGIN_BOTTOM) + DOCK_H + 18,
    [safeBottom],
  );

  const inputBottomPad = useMemo(() => {
    // iOS: KeyboardAvoidingView (padding) ya encoge el layout sobre el IME. Si además
    // paddingBottom ≈ altura del teclado, header + input + list flex:1 quedan sin hueco
    // y el FlatList colapsa a 0 (input visualmente bajo el header, zona central vacía).
    if (Platform.OS === 'ios') {
      if (keyboardOpen || keyboardOffset > 0) return CHAT_INPUT_KEYBOARD_GAP;
      return dockInputBottomPad;
    }
    if (keyboardOffset > 0) return keyboardOffset + CHAT_INPUT_KEYBOARD_GAP;
    if (keyboardOpen) {
      return Math.max(safeBottom, DOCK_MARGIN_BOTTOM) + DOCK_H + CHAT_INPUT_KEYBOARD_GAP;
    }
    return dockInputBottomPad;
  }, [dockInputBottomPad, keyboardOffset, keyboardOpen, safeBottom]);

  const user = useAuthStore((s) => s.user);

  const headerOpacity = useSharedValue(0);
  const headerY = useSharedValue(-15);
  const inputBarOpacity = useSharedValue(0);
  const inputBarY = useSharedValue(20);

  useFocusEffect(
    useCallback(() => {
      headerOpacity.value = 0;
      headerY.value = -15;
      inputBarOpacity.value = 0;
      inputBarY.value = 20;

      headerOpacity.value = withTiming(1, { duration: 500, easing: Easing.out(Easing.quad) });
      headerY.value = withTiming(0, { duration: 550, easing: Easing.out(Easing.cubic) });

      const t = setTimeout(() => {
        inputBarOpacity.value = withTiming(1, { duration: 400 });
        inputBarY.value = withTiming(0, { duration: 450, easing: Easing.out(Easing.cubic) });
      }, 250);
      return () => clearTimeout(t);
    }, [headerOpacity, headerY, inputBarOpacity, inputBarY]),
  );

  const headerAnimStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ translateY: headerY.value }],
  }));

  const inputBarAnimStyle = useAnimatedStyle(() => ({
    opacity: inputBarOpacity.value,
    transform: [{ translateY: inputBarY.value }],
  }));

  const scrollListToEndThrottled = useCallback(() => {
    const now = Date.now();
    if (now - lastListScrollAt.current < 400) return;
    lastListScrollAt.current = now;
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  useEffect(() => {
    if (!keyboardOpen && keyboardOffset <= 0) return;
    scrollListToEndThrottled();
  }, [keyboardOffset, keyboardOpen, scrollListToEndThrottled]);

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get<Profile>('/api/v1/me/profile'),
    retry: 1,
  });

  const welcomeText = useMemo(() => {
    const name = greetingFirstName(profile?.display_name, user?.email);
    const tail = 'soy tu coach de nutrición. Te ayudo con comidas, macros, hidratación, rutinas...';
    return name ? `${name}, ${tail}` : tail;
  }, [profile?.display_name, user?.email]);

  const sendMutation = useMutation({
    mutationFn: (payload: { message: string; imageBase64?: string; mimeType?: string }) =>
      api.post<ChatResponse>('/api/v1/chat/message', {
        message: payload.message,
        session_id: sessionId,
        ...(payload.imageBase64 && payload.mimeType
          ? { image_base64: payload.imageBase64, image_mime_type: payload.mimeType }
          : {}),
      }),
    onSuccess: (data) => {
      setSessionId(data.session_id);
      if (data.training_plan) {
        trainingPlans.current[data.message.id] = data.training_plan;
        setRoutineModalAutoMsgId(data.message.id);
      }
      setAnimatingMsgId(data.message.id);
      setMessages((prev) => [...prev, data.message]);
    },
    onError: (_e: unknown, variables) => {
      setMessages((p) => {
        // Busca hacia atrás el mensaje de usuario correspondiente (evita match solo por posición).
        for (let i = p.length - 1; i >= 0; i--) {
          const m = p[i];
          if (m.role === 'user' && m.content === variables.message && !m.failed) {
            return [
              ...p.slice(0, i),
              { ...m, failed: true, failedPayload: variables },
              ...p.slice(i + 1),
            ];
          }
        }
        return p;
      });
    },
  });

  const saveInsightMutation = useMutation({
    mutationFn: (p: { body: string; source_chat_message_id: string }) =>
      api.post<CoachSavedInsight>('/api/v1/chat/insights', p),
    onSuccess: (saved) => {
      if (saved.source_chat_message_id) {
        setSavedInsightMessageIds((prev) => new Set(prev).add(String(saved.source_chat_message_id)));
      }
      queryClient.invalidateQueries({ queryKey: ['coach-insights'] });
    },
  });

  const saveRoutineMutation = useMutation<WorkoutRoutine, Error, { messageId: string; plan: TrainingPlan }>({
    mutationFn: ({ plan }) =>
      api.post<WorkoutRoutine>('/api/v1/workouts/routines', trainingPlanToRoutinePayload(plan)),
    onSuccess: (_data, { messageId }) => {
      setSavedRoutineMessageIds((prev) => new Set(prev).add(messageId));
      queryClient.invalidateQueries({ queryKey: ['workout-routines'] });
      queryClient.invalidateQueries({ queryKey: ['workout-week-summary'] });
      Alert.alert(
        'Rutina guardada',
        'La rutina se ha añadido a tus rutinas del gym.',
        [
          { text: 'Cerrar', style: 'cancel' },
          { text: 'Ver rutinas', onPress: () => router.push('/training/routines') },
        ],
      );
    },
    onError: (e) =>
      Alert.alert('No se pudo guardar', toUserFacingErrorMessage(e, 'No se pudo guardar la rutina.')),
  });

  const insightsQuery = useQuery({
    queryKey: ['coach-insights'],
    queryFn: () => api.get<CoachSavedInsight[]>('/api/v1/chat/insights'),
    enabled: insightsOpen,
    retry: 1,
  });

  const [expandedInsightId, setExpandedInsightId] = useState<string | null>(null);

  const deleteInsightMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/chat/insights/${id}`),
    onSuccess: (_data, id) => {
      if (expandedInsightId === id) setExpandedInsightId(null);
      queryClient.setQueryData<CoachSavedInsight[]>(
        ['coach-insights'],
        (prev) => (prev ?? []).filter((i) => i.id !== id),
      );
    },
    onError: (e: unknown) => {
      Alert.alert('No se pudo borrar', toUserFacingErrorMessage(e, 'No se pudo borrar.'));
    },
  });

  useEffect(() => {
    if (messages.length === 0) return;
    const frame = requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [messages.length, sendMutation.isPending]);

  const isFreeUser = isNonPremiumTier(profile?.subscription_tier);

  const showNutriCoachLock = useCallback(() => {
    showPremiumLock({
      featureName: 'NutriCoach',
      title: 'NutriCoach es exclusivo de Premium',
      message:
        'El chat con IA es una función Premium. Suscríbete a NutrIA Premium para hablar con tu coach sin límites y usar toda la app de forma ilimitada.',
    });
  }, []);

  const handleSend = useCallback(
    (text?: string) => {
      if (sendMutation.isPending) return;
      const msg = text || input.trim();
      if (!msg) return;
      if (isFreeUser) {
        showNutriCoachLock();
        return;
      }

      const userMsg: ChatMessage = {
        id: Date.now().toString(),
        session_id: sessionId || '',
        role: 'user',
        content: msg,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      sendMutation.mutate({ message: msg });
    },
    [input, sendMutation, sessionId, isFreeUser, showNutriCoachLock],
  );

  const photoMenuAnchorRef = useRef<View>(null);
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const [photoMenuAnchor, setPhotoMenuAnchor] = useState<
    { x: number; y: number; width: number; height: number } | null
  >(null);

  const openPhotoMenu = useCallback(() => {
    if (isFreeUser) {
      showNutriCoachLock();
      return;
    }
    photoMenuAnchorRef.current?.measureInWindow((x, y, width, height) => {
      setPhotoMenuAnchor({ x, y, width, height });
      setPhotoMenuOpen(true);
    });
  }, [isFreeUser, showNutriCoachLock]);

  const closePhotoMenu = useCallback(() => {
    setPhotoMenuOpen(false);
    setPhotoMenuAnchor(null);
  }, []);

  const startNewChat = useCallback(() => {
    setMessages([]);
    setInput('');
    setSessionId(null);
    trainingPlans.current = {};
    setSavedInsightMessageIds(new Set());
    setRoutineModalAutoMsgId(null);
  }, []);

  const enqueueChatImageSend = useCallback(
    async (assetUri: string, mimeType: string) => {
      const caption = input.trim() || DEFAULT_CHAT_IMAGE_CAPTION;
      try {
        const b64 = await readAsStringAsync(assetUri, { encoding: EncodingType.Base64 });
        const userMsg: ChatMessage = {
          id: Date.now().toString(),
          session_id: sessionId || '',
          role: 'user',
          content: caption,
          created_at: new Date().toISOString(),
          local_image_uri: assetUri,
        };
        setMessages((prev) => [...prev, userMsg]);
        setInput('');
        sendMutation.mutate({
          message: caption,
          imageBase64: b64,
          mimeType: mimeType || 'image/jpeg',
        });
      } catch (e: unknown) {
        Alert.alert('No se pudo leer la imagen', toUserFacingErrorMessage(e, 'No se pudo leer la imagen.'));
      }
    },
    [input, sendMutation, sessionId],
  );

  const handleTakePhoto = useCallback(async () => {
    closePhotoMenu();
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permiso', 'Se necesita acceso a la cámara para tomar la foto.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.75 });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const a = result.assets[0];
      await enqueueChatImageSend(a.uri, a.mimeType ?? 'image/jpeg');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'No se pudo abrir la cámara.';
      Alert.alert(
        'Cámara no disponible',
        Platform.OS === 'web'
          ? 'En este navegador no puedo abrir la cámara. Usa "Elegir de la galería".'
          : msg,
      );
    }
  }, [closePhotoMenu, enqueueChatImageSend]);

  const handlePickFromLibrary = useCallback(async () => {
    closePhotoMenu();
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permiso', 'Se necesita acceso a la galería para elegir una foto.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.75,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const a = result.assets[0];
      await enqueueChatImageSend(a.uri, a.mimeType ?? 'image/jpeg');
    } catch (e: unknown) {
      Alert.alert('No se pudo abrir la galería', toUserFacingErrorMessage(e, 'No se pudo abrir la galería.'));
    }
  }, [closePhotoMenu, enqueueChatImageSend]);

  const photoMenuPos = useMemo(() => {
    if (!photoMenuAnchor) return null;
    const { width: winW, height: winH } = Dimensions.get('window');
    const pad = 12;
    const menuW = 220;
    const menuH = 108;
    let left = photoMenuAnchor.x;
    if (left + menuW > winW - pad) left = winW - menuW - pad;
    if (left < pad) left = pad;
    let top = photoMenuAnchor.y - menuH - 8;
    if (top < pad) top = photoMenuAnchor.y + photoMenuAnchor.height + 8;
    if (top + menuH > winH - pad) top = Math.max(pad, winH - menuH - pad);
    return { left, top, width: menuW };
  }, [photoMenuAnchor]);

  const consumeRoutineModalAuto = useCallback((messageId: string) => {
    setRoutineModalAutoMsgId((prev) => (prev === messageId ? null : prev));
  }, []);

  const renderMessage = useCallback(({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    const plan = trainingPlans.current[item.id];
    const hasText = !!item.content?.trim();
    const hasLocalImage = isUser && !!item.local_image_uri;
    const savedInsight = savedInsightMessageIds.has(item.id);
    const savedRoutine = savedRoutineMessageIds.has(item.id);
    const canSaveRoutine = !isUser && !!plan && plan.kind !== 'rehab' && plan.days.length > 0;
    const isAnimating = !isUser && item.id === animatingMsgId;

    const handleCopy = async () => {
      if (!item.content?.trim()) return;
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(item.content);
        Alert.alert('Copiado', 'Mensaje copiado al portapapeles.');
      } else {
        await Share.share({ message: item.content });
      }
    };

    const handleRetry = () => {
      const payload = item.failedPayload;
      if (!payload) return;
      // No borramos failedPayload hasta confirmar éxito; si falla de nuevo onError lo restaura.
      setMessages(p => p.map(m => m.id === item.id ? { ...m, failed: false } : m));
      sendMutation.mutate(payload);
    };

    return (
      <Animated.View entering={FadeIn.duration(320)} style={[styles.msgRow, isUser && styles.msgRowUser]}>
        <View style={styles.messageContentCol}>
          {hasText || hasLocalImage ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onLongPress={hasText ? handleCopy : undefined}
              delayLongPress={400}
            >
              <View style={[styles.msgBubble, isUser ? styles.userBubble : styles.assistantBubble, item.failed && styles.failedBubble]}>
                {hasLocalImage ? (
                  <Image
                    source={{ uri: item.local_image_uri as string }}
                    style={styles.msgUserImage}
                    contentFit="cover"
                  />
                ) : null}
                {hasText ? (
                  isAnimating ? (
                    <TypewriterMessage
                      text={item.content}
                      style={styles.msgText}
                      onFinish={() => setAnimatingMsgId(null)}
                    />
                  ) : (
                    <ChatRichText text={item.content} style={[styles.msgText, isUser && styles.userText]} />
                  )
                ) : null}
              </View>
            </TouchableOpacity>
          ) : null}
          {item.failed ? (
            <TouchableOpacity style={styles.retryRow} onPress={handleRetry}>
              <Ionicons name="refresh-outline" size={13} color={colors.error} />
              <Text style={styles.retryText}>Error al enviar · Reintentar</Text>
            </TouchableOpacity>
          ) : null}
          {!isUser && hasText ? (
            <View style={styles.messageActionsRow}>
              <TouchableOpacity
                style={[styles.insightSaveRow, savedInsight && styles.insightSaveRowSaved]}
                hitSlop={{ top: 8, bottom: 4, left: 8, right: 8 }}
                disabled={saveInsightMutation.isPending || savedInsight}
                onPress={() => {
                  saveInsightMutation
                    .mutateAsync({
                      body: item.content.slice(0, 8000),
                      source_chat_message_id: item.id,
                    })
                    .then(() => Alert.alert('Listo', 'Respuesta guardada.'))
                    .catch((e: Error) =>
                      Alert.alert('No se pudo guardar', toUserFacingErrorMessage(e, 'No se pudo guardar la respuesta.')),
                    );
                }}
              >
                <Ionicons
                  name={savedInsight ? 'bookmark' : 'bookmark-outline'}
                  size={14}
                  color={savedInsight ? colors.success : colors.primaryLight}
                />
                <Text style={[styles.insightSaveText, savedInsight && styles.insightSaveTextSaved]}>
                  {savedInsight ? 'Guardado' : 'Insight'}
                </Text>
              </TouchableOpacity>

              {canSaveRoutine ? (
                <TouchableOpacity
                  style={[styles.saveRoutineRow, savedRoutine && styles.saveRoutineRowSaved]}
                  hitSlop={{ top: 8, bottom: 4, left: 8, right: 8 }}
                  disabled={saveRoutineMutation.isPending || savedRoutine}
                  onPress={() => saveRoutineMutation.mutate({ messageId: item.id, plan: plan as TrainingPlan })}
                >
                  <Ionicons
                    name={savedRoutine ? 'checkmark-circle' : 'barbell-outline'}
                    size={14}
                    color={savedRoutine ? colors.success : colors.primaryLight}
                  />
                  <Text style={[styles.saveRoutineText, savedRoutine && styles.saveRoutineTextSaved]}>
                    {savedRoutine ? 'Guardada' : 'Guardar rutina'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
          {plan ? (
            <TrainingPlanCard plan={plan} />
          ) : null}
        </View>
      </Animated.View>
    );
  }, [
    saveInsightMutation,
    savedInsightMessageIds,
    savedRoutineMessageIds,
    routineModalAutoMsgId,
    consumeRoutineModalAuto,
    animatingMsgId,
    setAnimatingMsgId,
    sendMutation,
    setMessages,
  ]);

  const emptyWelcome = useMemo(
    () => (
      <Animated.View entering={FadeIn.duration(420).delay(140)} style={styles.emptyState}>
        <LinearGradient
          colors={['rgba(24, 67, 61, 0.94)', 'rgba(27, 36, 45, 0.98)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.emptyHeroCard}
        >
          <View pointerEvents="none" style={styles.emptyHeroGlowTop} />
          <View pointerEvents="none" style={styles.emptyHeroGlowBottom} />
          <View style={styles.emptyHeroTop}>
            <View style={styles.emptyHeroIcon}>
              <Image
                source={CHAT_AI_COACH_AVATAR}
                style={styles.emptyHeroIconImg}
                contentFit="contain"
                accessibilityIgnoresInvertColors
              />
            </View>
            <View style={styles.emptyHeroBadge}>
              <Text style={styles.emptyHeroBadgeText}>Coach IA</Text>
            </View>
          </View>

          <Text style={styles.emptyHeroTitle}>Comida, macros y rutina en el mismo chat</Text>
          <Text style={styles.emptyHeroBody}>{welcomeText}</Text>
        </LinearGradient>

        <View style={styles.sectionBlock}>
          <Text style={styles.sectionKicker}>Empieza por aqui</Text>
          <View style={styles.quickActionGrid}>
            {QUICK_ACTIONS.map((action) => (
              <TouchableOpacity
                key={action.title}
                style={styles.quickActionCard}
                onPress={() => handleSend(action.prompt)}
                activeOpacity={0.9}
              >
                <View style={styles.quickActionIcon}>
                  <Ionicons name={action.icon} size={18} color={colors.primaryLight} />
                </View>
                <Text style={styles.quickActionTitle}>{action.title}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.sectionBlockLast}>
          <Text style={styles.sectionKicker}>Ideas rapidas</Text>
          <View style={styles.chipGrid}>
            {QUICK_PROMPTS.map((prompt) => (
              <Chip key={prompt} label={prompt} compact onPress={() => handleSend(prompt)} />
            ))}
          </View>
        </View>
      </Animated.View>
    ),
    [handleSend, welcomeText],
  );

  const listFooter = useMemo(
    () => (
      <>
        {sendMutation.isPending ? (
          <Animated.View entering={FadeIn.duration(220)} style={styles.msgRow}>
            <View style={styles.messageContentCol}>
              <View style={[styles.msgBubble, styles.assistantBubble, styles.typingBubble]}>
                <View style={styles.typingDotsWrap}>
                  <ActivityIndicator size="small" color={colors.primaryLight} />
                </View>
                <Text style={styles.typingText}>Preparando respuesta...</Text>
              </View>
            </View>
          </Animated.View>
        ) : null}
        <View style={styles.listBottomSpacer} />
      </>
    ),
    [sendMutation.isPending],
  );

  const showBackgroundArt = messages.length === 0;

  return (
    <View style={styles.bg}>
      {showBackgroundArt ? <Image source={CHAT_BG} style={styles.chatBgImage} contentFit="cover" /> : null}
      <View style={[styles.bgScrim, showBackgroundArt && styles.bgScrimWithArt]} />

      <LinearGradient
        colors={[...authFotoGradientColors]}
        locations={[...authFotoGradientLocations]}
        style={styles.gradient}
      >
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <Animated.View
            style={[
              styles.header,
              { paddingTop: Math.max(insets.top, spacing.md) + spacing.sm },
              headerAnimStyle,
            ]}
          >
            <View style={styles.headerRow}>
              <View style={styles.botAvatar}>
                <Image
                  source={CHAT_AI_COACH_AVATAR}
                  style={styles.botAvatarImg}
                  contentFit="contain"
                  accessibilityIgnoresInvertColors
                />
              </View>

              <View style={styles.headerTextCol}>
                <Text style={styles.title}>NutriCoach</Text>
              </View>

              <View style={styles.headerActions}>
                <Pressable
                  onPress={startNewChat}
                  disabled={sendMutation.isPending}
                  style={({ pressed }) => [
                    styles.headerNewChatBtn,
                    pressed && !sendMutation.isPending && styles.headerNewChatBtnPressed,
                    sendMutation.isPending && styles.headerNewChatBtnDisabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Crear nuevo chat"
                >
                  <Ionicons name="add" size={16} color={colors.primaryLight} />
                </Pressable>
                <Pressable
                  onPress={() => setInsightsOpen(true)}
                  style={({ pressed }) => [styles.headerInsightsBtn, pressed && styles.headerInsightsBtnPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Ver respuestas guardadas"
                >
                  <Ionicons name="bookmark-outline" size={16} color={colors.primaryLight} />
                </Pressable>
                <View style={styles.headerTag}>
                  <Text style={styles.headerTagText}>IA</Text>
                </View>
              </View>
            </View>
          </Animated.View>

          {messages.length === 0 ? (
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.messageList}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {emptyWelcome}
              {listFooter}
            </ScrollView>
          ) : (
            <FlatList
              ref={flatListRef}
              style={styles.list}
              data={messages}
              ListFooterComponent={listFooter}
              renderItem={renderMessage}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.messageList}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={scrollListToEndThrottled}
            />
          )}

          <Animated.View style={[styles.inputRow, { paddingBottom: inputBottomPad }, inputBarAnimStyle]}>
            <View style={styles.inputPill}>
              <View ref={photoMenuAnchorRef} collapsable={false} style={styles.inputPillLeadWrap}>
                <Pressable
                  onPress={openPhotoMenu}
                  style={({ pressed }) => [styles.inputLead, pressed && styles.inputLeadPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Enviar imagen a NutriCoach"
                  hitSlop={6}
                >
                  <Ionicons name="camera-outline" size={18} color={colors.primaryLight} />
                </Pressable>
              </View>

              <View style={styles.inputFieldWrap}>
                <TextInput
                  style={styles.input}
                  value={input}
                  onChangeText={setInput}
                  onFocus={scrollListToEndThrottled}
                  onContentSizeChange={scrollListToEndThrottled}
                  placeholder="¿En qué te ayudo? Alimentación, rutinas…"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  maxLength={2000}
                />
              </View>

              <TouchableOpacity
                onPress={() => handleSend()}
                style={[styles.sendFab, !input.trim() && styles.sendFabDisabled]}
                disabled={!input.trim() || sendMutation.isPending}
                activeOpacity={0.9}
              >
                <Ionicons name="send" size={Platform.OS === 'web' ? 16 : 18} color={colors.white} />
              </TouchableOpacity>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </LinearGradient>

      <Modal
        visible={photoMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={closePhotoMenu}
      >
        <Pressable style={styles.photoMenuBackdrop} onPress={closePhotoMenu}>
          {photoMenuPos ? (
            <Pressable
              onPress={() => {}}
              style={[
                styles.photoMenuCard,
                { left: photoMenuPos.left, top: photoMenuPos.top, width: photoMenuPos.width },
              ]}
            >
              <TouchableOpacity
                style={styles.photoMenuItem}
                onPress={handleTakePhoto}
                activeOpacity={0.85}
              >
                <Ionicons name="camera-outline" size={20} color={colors.primaryLight} />
                <Text style={styles.photoMenuItemText}>Tomar foto</Text>
              </TouchableOpacity>
              <View style={styles.photoMenuDivider} />
              <TouchableOpacity
                style={styles.photoMenuItem}
                onPress={handlePickFromLibrary}
                activeOpacity={0.85}
              >
                <Ionicons name="images-outline" size={20} color={colors.primaryLight} />
                <Text style={styles.photoMenuItemText}>Elegir de la galería</Text>
              </TouchableOpacity>
            </Pressable>
          ) : null}
        </Pressable>
      </Modal>

      <Modal
        visible={insightsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setInsightsOpen(false)}
      >
        <View style={styles.insightsModalRoot}>
          <Pressable style={styles.insightsBackdrop} onPress={() => setInsightsOpen(false)} />
          <View style={[styles.insightsSheet, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
            <View style={styles.insightsHeader}>
              <View style={styles.insightsHeaderText}>
                <Text style={styles.insightsTitle}>Respuestas guardadas</Text>
                <Text style={styles.insightsSubtitle}>Respuestas del coach para consultar luego</Text>
              </View>
              <Pressable
                onPress={() => setInsightsOpen(false)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Cerrar respuestas"
              >
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </Pressable>
            </View>

            {insightsQuery.isLoading ? (
              <View style={styles.insightsState}>
                <ActivityIndicator color={colors.primaryLight} />
              </View>
            ) : insightsQuery.isError ? (
              <View style={styles.insightsState}>
                <Text style={styles.insightsEmptyTitle}>No se pudieron cargar</Text>
                <Text style={styles.insightsEmptyText}>
                  {toUserFacingErrorMessage(insightsQuery.error, 'Inténtalo de nuevo.')}
                </Text>
              </View>
            ) : (insightsQuery.data ?? []).length === 0 ? (
              <View style={styles.insightsState}>
                <Ionicons name="bookmark-outline" size={30} color={colors.textMuted} />
                <Text style={styles.insightsEmptyTitle}>Aún no hay respuestas</Text>
                <Text style={styles.insightsEmptyText}>Guarda una respuesta del coach desde el botón Guardar.</Text>
              </View>
            ) : (
              <ScrollView style={styles.insightsList} contentContainerStyle={styles.insightsListContent}>
                {(insightsQuery.data ?? []).map((insight) => {
                  const isExpanded = expandedInsightId === insight.id;
                  const preview = insight.body.slice(0, 80) + (insight.body.length > 80 ? '…' : '');
                  return (
                    <View key={insight.id} style={styles.insightCard}>
                      <View style={styles.insightCardHeader}>
                        <TouchableOpacity
                          style={styles.insightCardHeaderText}
                          onPress={() => setExpandedInsightId(isExpanded ? null : insight.id)}
                          activeOpacity={0.75}
                        >
                          <Text style={styles.insightDate}>
                            {new Date(insight.created_at).toLocaleDateString('es-ES', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </Text>
                          {!isExpanded && (
                            <Text style={styles.insightPreview} numberOfLines={1}>{preview}</Text>
                          )}
                        </TouchableOpacity>
                        <View style={styles.insightCardActions}>
                          <Pressable
                            hitSlop={12}
                            onPress={() => {
                              Alert.alert(
                                'Borrar respuesta',
                                '¿Seguro que quieres eliminar esta respuesta guardada?',
                                [
                                  { text: 'Cancelar', style: 'cancel' },
                                  {
                                    text: 'Borrar',
                                    style: 'destructive',
                                    onPress: () => deleteInsightMutation.mutate(insight.id),
                                  },
                                ],
                              );
                            }}
                            disabled={deleteInsightMutation.isPending}
                          >
                            <Ionicons name="trash-outline" size={16} color={colors.error} />
                          </Pressable>
                          <Pressable
                            hitSlop={12}
                            onPress={() => setExpandedInsightId(isExpanded ? null : insight.id)}
                          >
                            <Ionicons
                              name={isExpanded ? 'chevron-up' : 'chevron-down'}
                              size={16}
                              color={colors.textMuted}
                            />
                          </Pressable>
                        </View>
                      </View>
                      {isExpanded && (
                        <ChatRichText text={insight.body} style={styles.insightBody} />
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.background },
  chatBgImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    opacity: 0.22,
  } as ImageStyle,
  bgScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.glassBackdropStrong,
  },
  bgScrimWithArt: {
    backgroundColor: colors.glassBackdrop,
  },
  gradient: { flex: 1 },
  container: { flex: 1, backgroundColor: 'transparent' },
  header: {
    paddingHorizontal: screenPaddingX,
    paddingBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  botAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  botAvatarImg: {
    width: 52,
    height: 52,
    backgroundColor: 'transparent',
    transform: [{ translateY: 2 }, { scale: 1.34 }],
  },
  headerTextCol: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...typography.sectionTitle,
    color: colors.text,
    fontSize: 19,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerNewChatBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  headerNewChatBtnPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.94 }],
  },
  headerNewChatBtnDisabled: {
    opacity: 0.45,
  },
  headerInsightsBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  headerInsightsBtnPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.97 }],
  },
  headerTag: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTagText: {
    ...typography.micro,
    color: colors.textSecondary,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  list: { flex: 1 },
  messageList: {
    paddingHorizontal: screenPaddingX,
    paddingBottom: spacing.sm,
  },
  emptyState: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  emptyHeroCard: {
    minHeight: 214,
    borderRadius: 22,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    borderWidth: 1,
    borderColor: EMPTY_HERO_BORDER,
    marginBottom: spacing.lg,
    overflow: 'hidden',
    ...platformBoxShadow(
      '0 18px 34px rgba(0,0,0,0.22)',
      {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.12,
        shadowRadius: 20,
      },
      4,
    ),
  },
  emptyHeroGlowTop: {
    position: 'absolute',
    top: -62,
    left: -42,
    width: 168,
    height: 168,
    borderRadius: 84,
    backgroundColor: EMPTY_HERO_GLOW_TOP,
  },
  emptyHeroGlowBottom: {
    position: 'absolute',
    right: -64,
    bottom: -78,
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: EMPTY_HERO_GLOW_BOTTOM,
  },
  emptyHeroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  emptyHeroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: EMPTY_HERO_ICON_BG,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: EMPTY_HERO_ICON_BORDER,
  },
  emptyHeroIconImg: {
    width: 56,
    height: 56,
    backgroundColor: 'transparent',
    transform: [{ translateY: 1 }, { scale: 1.18 }],
  },
  emptyHeroBadge: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: EMPTY_HERO_BADGE_BG,
    borderWidth: 1,
    borderColor: EMPTY_HERO_BADGE_BORDER,
    marginTop: spacing.lg,
  },
  emptyHeroBadgeText: {
    ...typography.micro,
    color: EMPTY_HERO_BADGE_TEXT,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  emptyHeroTitle: {
    ...typography.h2,
    color: colors.text,
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '800',
    letterSpacing: -0.35,
    marginBottom: spacing.sm,
    maxWidth: 286,
  },
  emptyHeroBody: {
    ...typography.body,
    color: EMPTY_HERO_BODY_TEXT,
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 306,
  },
  sectionBlock: {
    marginBottom: spacing.lg,
  },
  sectionBlockLast: {
    marginBottom: spacing.sm,
  },
  sectionKicker: {
    ...typography.label,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  quickActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  quickActionCard: {
    width: '48.5%',
    minWidth: 150,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceGlassStrong,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickActionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryMuted,
    marginBottom: spacing.md,
  },
  quickActionTitle: {
    ...typography.captionBold,
    color: colors.text,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  msgRow: {
    marginBottom: spacing.md,
    flexDirection: 'row',
  },
  msgRowUser: {
    justifyContent: 'flex-end',
  },
  messageContentCol: {
    maxWidth: '92%',
  },
  msgBubble: {
    maxWidth: '100%',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
  },
  userBubble: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 6,
  },
  msgUserImage: {
    width: 220,
    maxWidth: '100%',
    height: 160,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.overlaySoft,
  },
  assistantBubble: {
    backgroundColor: colors.surfaceGlassStrongest,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  msgText: {
    ...typography.body,
    color: colors.text,
    lineHeight: 22,
  },
  userText: {
    color: colors.white,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  typingDotsWrap: {
    width: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typingText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  failedBubble: {
    borderWidth: 1,
    borderColor: colors.error + '66',
    opacity: 0.85,
  },
  retryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    marginTop: 4,
    gap: 4,
  },
  retryText: {
    ...typography.caption,
    color: colors.error,
    fontSize: 12,
  },
  insightSaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    minHeight: 30,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  insightSaveRowSaved: {
    backgroundColor: colors.successMuted,
    borderColor: colors.success,
  },
  insightSaveText: {
    ...typography.caption,
    color: colors.primaryLight,
    fontWeight: '700',
  },
  insightSaveTextSaved: {
    color: colors.success,
  },
  messageActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  saveRoutineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    minHeight: 30,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  saveRoutineRowSaved: {
    backgroundColor: colors.successMuted,
    borderColor: colors.success,
  },
  saveRoutineText: {
    ...typography.caption,
    color: colors.primaryLight,
    fontWeight: '700',
  },
  saveRoutineTextSaved: {
    color: colors.success,
  },
  listBottomSpacer: {
    height: spacing.xs,
  },
  inputRow: {
    paddingHorizontal: screenPaddingX,
    paddingTop: spacing.xs,
    backgroundColor: 'transparent',
  },
  inputPill: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.surfaceFloating,
    borderRadius: borderRadius.xxl,
    paddingLeft: spacing.md,
    paddingRight: Platform.OS === 'web' ? 6 : 6,
    paddingTop: Platform.OS === 'web' ? 10 : 9,
    paddingBottom: Platform.OS === 'web' ? 10 : 9,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  inputPillLeadWrap: {
    alignSelf: 'center',
    marginRight: spacing.sm,
  },
  inputFieldWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  inputLead: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryMuted,
  },
  input: {
    width: '100%',
    color: colors.text,
    ...typography.body,
    maxHeight: 100,
    paddingVertical: Platform.OS === 'android' ? 4 : 6,
    minHeight: Platform.OS === 'web' ? 32 : 40,
    textAlignVertical: 'center',
    includeFontPadding: false,
    ...(Platform.OS === 'web' ? { lineHeight: 20 } : {}),
  },
  sendFab: {
    width: Platform.OS === 'web' ? 36 : 40,
    height: Platform.OS === 'web' ? 36 : 40,
    borderRadius: Platform.OS === 'web' ? 18 : 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
    alignSelf: 'center',
  },
  sendFabDisabled: {
    opacity: 0.35,
  },
  inputLeadPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.95 }],
  },
  photoMenuBackdrop: {
    flex: 1,
    backgroundColor: colors.overlaySoft,
  },
  photoMenuCard: {
    position: 'absolute',
    backgroundColor: colors.surfaceFloatingStrong,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingVertical: spacing.xs,
    ...platformBoxShadow(
      '0 10px 28px rgba(0,0,0,0.45)',
      {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
      10,
    ),
  },
  photoMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  photoMenuItemText: {
    ...typography.body,
    color: colors.text,
  },
  photoMenuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
  },
  insightsModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  insightsBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlaySoft,
  },
  insightsSheet: {
    maxHeight: '78%',
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    backgroundColor: colors.surfaceFloatingStrong,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: screenPaddingX,
    paddingTop: spacing.lg,
  },
  insightsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  insightsHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  insightsTitle: {
    ...typography.sectionTitle,
    color: colors.text,
  },
  insightsSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  insightsState: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  insightsEmptyTitle: {
    ...typography.bodyBold,
    color: colors.text,
    textAlign: 'center',
  },
  insightsEmptyText: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 19,
  },
  insightsList: {
    maxHeight: 460,
  },
  insightsListContent: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  insightCard: {
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surfaceGlassStrong,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  insightCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    padding: spacing.md,
  },
  insightCardHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  insightCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 0,
  },
  insightDate: {
    ...typography.micro,
    color: colors.textMuted,
    fontWeight: '700',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  insightPreview: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  insightBody: {
    ...typography.body,
    color: colors.text,
    lineHeight: 21,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
});
