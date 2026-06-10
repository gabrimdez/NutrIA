import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Alert,
  Platform,
  TextInput,
  ScrollView,
  useWindowDimensions,
  TouchableOpacity,
} from 'react-native';
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/lib/api';
import { toUserFacingErrorMessage } from '../../src/lib/userFacingError';
import { LoadingScreen, Surface, UIButton } from '../../src/components';
import { colors, spacing, typography, screenPaddingX, hairlineWidth, borderRadius } from '../../src/theme';
import type { WeightLog } from '../../src/types';
import { format, parseISO, subDays, isSameDay } from 'date-fns';
import { es as esLocale } from 'date-fns/locale';

const CHART_H = 160;
const DAY_W = 52;
const PAD_TOP = 24;
const PAD_BOT = 28;
const DAYS_VISIBLE = 7;
const PAGE_SIZE = 6;
/** Ancho columna eje Y: número + " kg" (mismo tono que etiquetas de días en el gráfico). */
const Y_AXIS_W = 56;
const TREND_GAIN_BG = colors.errorMuted;
const TREND_LOSS_BG = colors.successMuted;

function fmtKg(kg: number): string {
  return Number(kg.toFixed(2)).toString();
}

function dayLabel(d: Date): string {
  const today = new Date();
  if (isSameDay(d, today)) return 'Hoy';
  return format(d, 'EEE', { locale: esLocale }).replace(/^\w/, (c) => c.toUpperCase());
}

function formatDateShort(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'd MMM yyyy', { locale: esLocale });
  } catch {
    return dateStr;
  }
}

/** Más reciente primero: día (desc) y, el mismo día, `created_at` o id. */
function compareWeightLogsNewestFirst(a: WeightLog, b: WeightLog): number {
  let ta: number;
  let tb: number;
  try {
    ta = parseISO(a.date).getTime();
    tb = parseISO(b.date).getTime();
  } catch {
    return b.date.localeCompare(a.date);
  }
  if (tb !== ta) return tb - ta;
  const ca = a.created_at != null ? Date.parse(a.created_at) : NaN;
  const cb = b.created_at != null ? Date.parse(b.created_at) : NaN;
  if (Number.isFinite(cb) && Number.isFinite(ca) && cb !== ca) return cb - ca;
  if (Number.isFinite(cb) && !Number.isFinite(ca)) return -1;
  if (!Number.isFinite(cb) && Number.isFinite(ca)) return 1;
  return b.id.localeCompare(a.id);
}

/* ── Chart component ── */

function WeightChart({ logs }: { logs: WeightLog[] }) {
  const { width: screenW } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);

  const sorted = useMemo(
    () => [...logs].sort((a, b) => a.date.localeCompare(b.date)),
    [logs],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of sorted) map.set(l.date, l.weight_kg);
    return map;
  }, [sorted]);

  const allDates = useMemo(() => {
    if (sorted.length === 0) return [];
    const first = parseISO(sorted[0].date);
    const last = new Date();
    const dates: Date[] = [];
    let cur = first;
    while (cur <= last) {
      dates.push(new Date(cur));
      cur = new Date(cur);
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  }, [sorted]);

  if (allDates.length === 0) return null;

  const totalW = Math.max(allDates.length * DAY_W, screenW - screenPaddingX * 2);
  const plotH = CHART_H - PAD_TOP - PAD_BOT;

  const points: {
    x: number;
    y: number;
    kg: number;
    label: string;
    isToday: boolean;
    /** true cuando el día tiene un registro real (no relleno desde el día previo). */
    recorded: boolean;
  }[] = [];
  let minKg = Infinity, maxKg = -Infinity;
  for (const d of allDates) {
    const key = format(d, 'yyyy-MM-dd');
    const kg = byDate.get(key);
    if (kg !== undefined) {
      if (kg < minKg) minKg = kg;
      if (kg > maxKg) maxKg = kg;
    }
  }
  const range = maxKg - minKg || 1;
  const padKg = range * 0.15;
  const lo = minKg - padKg;
  const hi = maxKg + padKg;

  let lastKg: number | null = null;
  for (let i = 0; i < allDates.length; i++) {
    const d = allDates[i];
    const key = format(d, 'yyyy-MM-dd');
    const recordedKg = byDate.get(key);
    const kg: number | null = recordedKg ?? lastKg;
    if (kg === null) continue;
    lastKg = kg;
    const x = i * DAY_W + DAY_W / 2;
    const y = PAD_TOP + plotH - ((kg - lo) / (hi - lo)) * plotH;
    points.push({
      x,
      y,
      kg,
      label: dayLabel(d),
      isToday: isSameDay(d, new Date()),
      recorded: recordedKg !== undefined,
    });
  }

  const polyPoints = points.map((p) => `${p.x},${p.y}`).join(' ');

  const gridLines = 4;
  const gridVals: number[] = [];
  for (let i = 0; i <= gridLines; i++) {
    gridVals.push(lo + (hi - lo) * (i / gridLines));
  }

  return (
    <Surface variant="subtle" padding="md" style={s.chartCard}>
      <View style={s.chartHeaderRow}>
        <Text style={s.chartTitle}>Progreso</Text>
        <Text style={s.chartHint}>Desliza para ver mas →</Text>
      </View>
      <View style={s.chartBody}>
        {/* Columna fija: eje Y (kg) — no debe comprimirse cuando el gráfico es ancho (p. ej. en web) */}
        <View style={s.chartYAxis}>
          <Svg width={Y_AXIS_W} height={CHART_H} style={s.chartYAxisSvg}>
            {gridVals.map((val, i) => {
              const gy = PAD_TOP + plotH - ((val - lo) / (hi - lo)) * plotH;
              const num = range >= 4 ? Math.round(val).toString() : val.toFixed(1);
              const label = `${num} kg`;
              return (
                <SvgText
                  key={i}
                  x={Y_AXIS_W / 2}
                  y={gy + 4}
                  fill={colors.textMuted}
                  fontSize={10}
                  fontWeight="400"
                  textAnchor="middle"
                >
                  {label}
                </SvgText>
              );
            })}
          </Svg>
        </View>
        {/* Área scrolleable: solo el trazo y días, el peso queda a la izquierda */}
        <ScrollView
          ref={scrollRef}
          style={s.chartScroll}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ width: totalW, height: CHART_H }}
          onContentSizeChange={() => {
            scrollRef.current?.scrollToEnd({ animated: false });
          }}
        >
          <Svg width={totalW} height={CHART_H}>
            {gridVals.map((val, i) => {
              const gy = PAD_TOP + plotH - ((val - lo) / (hi - lo)) * plotH;
              return (
                <Line
                  key={i}
                  x1={0}
                  y1={gy}
                  x2={totalW}
                  y2={gy}
                  stroke={colors.border}
                  strokeWidth={0.5}
                />
              );
            })}

            {points.length > 1 && (
              <Polyline
                points={polyPoints}
                fill="none"
                stroke={colors.success}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}

            {points.map((p, i) => (
              <React.Fragment key={i}>
                <Circle cx={p.x} cy={p.y} r={p.isToday ? 5 : 3.5} fill={colors.success} />
                {p.recorded ? (
                  <SvgText
                    x={p.x}
                    y={Math.max(PAD_TOP - 2, p.y - (p.isToday ? 12 : 10))}
                    fill={colors.text}
                    fontSize={10}
                    fontWeight="600"
                    textAnchor="middle"
                  >
                    {`${fmtKg(p.kg)} kg`}
                  </SvgText>
                ) : null}
                <SvgText
                  x={p.x}
                  y={CHART_H - 4}
                  fill={p.isToday ? colors.success : colors.textMuted}
                  fontSize={10}
                  fontWeight={p.isToday ? '700' : '400'}
                  textAnchor="middle"
                >
                  {p.label}
                </SvgText>
              </React.Fragment>
            ))}
          </Svg>
        </ScrollView>
      </View>
    </Surface>
  );
}

/* ── Main screen ── */

export default function WeightHistoryScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [newWeight, setNewWeight] = useState('');
  /** Página 0 = registros más recientes (6 por página). */
  const [page, setPage] = useState(0);

  const { data: history, isLoading } = useQuery<WeightLog[]>({
    queryKey: ['weight-history'],
    queryFn: () => api.get<WeightLog[]>('/api/v1/progress/weight-history'),
  });

  const logMutation = useMutation({
    mutationFn: async () => {
      const kg = parseFloat(newWeight.replace(',', '.'));
      if (!Number.isFinite(kg) || kg < 30 || kg > 300) throw new Error('Peso inválido (30-300 kg)');
      await api.post('/api/v1/progress/weight', {
        weight_kg: kg,
        date: new Date().toISOString().split('T')[0],
      });
      await api.put('/api/v1/me/profile', { current_weight_kg: kg });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weight-history'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['progress'] });
      setNewWeight('');
      setPage(0);
      if (Platform.OS === 'web') {
        window.alert('Peso registrado');
      } else {
        Alert.alert('Registrado', 'Peso guardado correctamente');
      }
    },
    onError: (e: unknown) => {
      const msg = toUserFacingErrorMessage(e, 'Algo salió mal. Inténtalo de nuevo.');
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('No se pudo registrar', msg);
      }
    },
  });

  const sorted = useMemo(
    () => [...(history ?? [])].sort(compareWeightLogsNewestFirst),
    [history],
  );
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(sorted.length / PAGE_SIZE) - 1);
    if (page > maxPage) setPage(maxPage);
  }, [sorted.length, page]);

  const pageSlice = useMemo(() => {
    const start = page * PAGE_SIZE;
    return sorted.slice(start, start + PAGE_SIZE);
  }, [sorted, page]);

  const currentKg = sorted.length > 0 ? sorted[0].weight_kg : null;
  const firstKg = sorted.length > 1 ? sorted[sorted.length - 1].weight_kg : null;
  const totalDiff = currentKg !== null && firstKg !== null ? currentKg - firstKg : null;

  if (isLoading) return <LoadingScreen />;

  const header = (
    <>
      {/* Peso actual */}
      {currentKg !== null && (
        <Surface variant="subtle" padding="md" style={s.currentCard}>
          <View style={s.currentRow}>
            <View style={s.currentIconWrap}>
              <Ionicons name="scale-outline" size={18} color={colors.primaryLight} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.currentLabel}>PESO ACTUAL</Text>
              <Text style={s.currentValue}>{fmtKg(currentKg!)} <Text style={s.currentUnit}>kg</Text></Text>
            </View>
            {totalDiff !== null && Math.abs(totalDiff) >= 0.05 && (
              <View style={[s.totalDiffBadge, { backgroundColor: totalDiff > 0 ? TREND_GAIN_BG : TREND_LOSS_BG }]}>
                <Ionicons
                  name={totalDiff > 0 ? 'trending-up' : 'trending-down'}
                  size={14}
                  color={totalDiff > 0 ? colors.error : colors.success}
                />
                <Text style={[s.totalDiffText, { color: totalDiff > 0 ? colors.error : colors.success }]}>
                  {totalDiff > 0 ? '+' : ''}{totalDiff.toFixed(1)} kg
                </Text>
              </View>
            )}
          </View>
        </Surface>
      )}

      {/* Registrar */}
      <View style={s.registerRow}>
        <View style={s.registerInput}>
          <TextInput
            style={s.weightInput}
            value={newWeight}
            onChangeText={setNewWeight}
            placeholder="78.5"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            returnKeyType="done"
          />
          <View style={s.kgSuffix}>
            <Text style={s.kgLabel}>kg</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[s.registerBtn, (!newWeight.trim() || logMutation.isPending) && s.registerBtnDisabled]}
          onPress={() => logMutation.mutate()}
          disabled={logMutation.isPending || !newWeight.trim()}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={16} color={colors.white} />
          <Text style={s.registerBtnText}>Registrar</Text>
        </TouchableOpacity>
      </View>

      {/* Chart */}
      {sorted.length >= 1 && <WeightChart logs={sorted} />}

      <Text style={s.listTitle}>Historial</Text>
    </>
  );

  if (sorted.length === 0) {
    return (
      <View style={s.container}>
        <View style={{ paddingHorizontal: screenPaddingX, paddingTop: spacing.md }}>
          {header}
        </View>
        <View style={s.emptyWrap}>
          <Ionicons name="analytics-outline" size={48} color={colors.textMuted} />
          <Text style={s.emptyText}>Sin registros de peso</Text>
          <Text style={s.emptyHint}>Registra tu peso para ver tu progreso</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <FlatList
        data={pageSlice}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: screenPaddingX,
          paddingTop: spacing.md,
          paddingBottom: Math.max(insets.bottom, 24) + 16,
        }}
        ListHeaderComponent={header}
        renderItem={({ item, index }) => {
          const globalIndex = page * PAGE_SIZE + index;
          const older = sorted[globalIndex + 1];
          return (
            <Surface variant="subtle" style={[s.historyRow, index === 0 && page === 0 && { marginTop: spacing.xs }]}>
              <View style={s.rowContent}>
                <View style={s.rowLeft}>
                  <Text style={s.rowDate}>{formatDateShort(item.date)}</Text>
                  {item.notes ? <Text style={s.rowNotes}>{item.notes}</Text> : null}
                </View>
                <View style={s.rowRight}>
                  <Text style={s.rowWeight}>{fmtKg(item.weight_kg)} kg</Text>
                  {older ? <DiffBadge current={item.weight_kg} previous={older.weight_kg} /> : null}
                </View>
              </View>
            </Surface>
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: spacing.xs }} />}
        ListFooterComponent={
          sorted.length > PAGE_SIZE ? (
            <View style={s.paginationBar}>
              <TouchableOpacity
                style={[s.paginationBtn, page === 0 && s.paginationBtnDisabled]}
                onPress={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                activeOpacity={0.75}
              >
                <Ionicons name="chevron-back" size={18} color={page === 0 ? colors.textTertiary : colors.primaryLight} />
                <Text style={[s.paginationBtnLabel, page === 0 && s.paginationBtnLabelDisabled]}>Anterior</Text>
              </TouchableOpacity>
              <Text style={s.paginationMeta}>
                {page + 1} / {totalPages}
              </Text>
              <TouchableOpacity
                style={[s.paginationBtn, page >= totalPages - 1 && s.paginationBtnDisabled]}
                onPress={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                activeOpacity={0.75}
              >
                <Text style={[s.paginationBtnLabel, page >= totalPages - 1 && s.paginationBtnLabelDisabled]}>Siguiente</Text>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={page >= totalPages - 1 ? colors.textTertiary : colors.primaryLight}
                />
              </TouchableOpacity>
            </View>
          ) : null
        }
      />
    </View>
  );
}

function DiffBadge({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  if (Math.abs(diff) < 0.05) return null;
  const positive = diff > 0;
  return (
    <View style={[s.diffRow, { backgroundColor: positive ? TREND_GAIN_BG : TREND_LOSS_BG }]}>
      <Ionicons name={positive ? 'arrow-up' : 'arrow-down'} size={10} color={positive ? colors.error : colors.success} />
      <Text style={[s.diffText, { color: positive ? colors.error : colors.success }]}>
        {Math.abs(diff).toFixed(1)}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  /* Current weight */
  currentCard: { marginBottom: spacing.sm, borderRadius: borderRadius.lg },
  currentRow: { flexDirection: 'row', alignItems: 'center' },
  currentIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  currentLabel: { ...typography.caption, color: colors.textMuted, fontSize: 10, letterSpacing: 0.8 },
  currentValue: { ...typography.sectionTitle, color: colors.text, fontSize: 22, marginTop: -1 },
  currentUnit: { fontSize: 14, color: colors.textSecondary, fontWeight: '400' },
  totalDiffBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  totalDiffText: { fontSize: 12, fontWeight: '700' },

  /* Register row */
  registerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  registerInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: borderRadius.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    height: 42,
    minWidth: 0,
  },
  weightInput: {
    flex: 1,
    minWidth: 0,
    ...typography.body,
    color: colors.text,
    fontSize: 16,
    height: 42,
    paddingVertical: 0,
  },
  /** Sufijo compacto: el número gana ancho útil. */
  kgSuffix: {
    flexShrink: 0,
    paddingLeft: 4,
    paddingRight: 2,
    justifyContent: 'center',
  },
  kgLabel: { ...typography.bodyBold, color: colors.textSecondary, fontSize: 13 },
  registerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.success,
    paddingHorizontal: 14,
    height: 42,
    borderRadius: borderRadius.md,
  },
  registerBtnDisabled: { opacity: 0.5 },
  registerBtnText: { color: colors.white, fontWeight: '600', fontSize: 14 },

  /* Chart */
  chartCard: { marginBottom: spacing.md, borderRadius: borderRadius.lg },
  chartHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  chartTitle: { ...typography.bodyBold, color: colors.text, fontSize: 14 },
  chartHint: { ...typography.caption, color: colors.textMuted, fontSize: 11 },
  /** minWidth:0 + flex en el scroll evita que en web el ScrollView colapse el eje Y. */
  chartBody: { flexDirection: 'row', alignItems: 'stretch', width: '100%' as const, minWidth: 0 },
  chartYAxis: {
    width: Y_AXIS_W,
    flexShrink: 0,
    minWidth: Y_AXIS_W,
    height: CHART_H,
    zIndex: 1,
  },
  chartYAxisSvg: { flexShrink: 0 },
  chartScroll: { flex: 1, minWidth: 0, height: CHART_H },

  /* List */
  listTitle: { ...typography.bodyBold, color: colors.text, fontSize: 14, marginBottom: spacing.xs },
  emptyWrap: { alignItems: 'center', paddingTop: spacing.xxl, gap: spacing.sm },
  emptyText: { ...typography.bodyBold, color: colors.textMuted },
  emptyHint: { ...typography.caption, color: colors.textMuted, textAlign: 'center', paddingHorizontal: spacing.xl },
  historyRow: { borderRadius: borderRadius.md, overflow: 'hidden' },
  rowContent: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: spacing.md },
  rowLeft: { flex: 1 },
  rowDate: { ...typography.body, color: colors.text, fontSize: 13 },
  rowNotes: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  rowRight: { alignItems: 'flex-end', gap: 3 },
  rowWeight: { ...typography.bodyBold, color: colors.text, fontSize: 15 },
  diffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  diffText: { fontSize: 11, fontWeight: '600' },
  paginationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  paginationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  paginationBtnDisabled: { opacity: 0.45 },
  paginationBtnLabel: { ...typography.captionBold, color: colors.primaryLight, fontSize: 14 },
  paginationBtnLabelDisabled: { color: colors.textTertiary },
  paginationMeta: { ...typography.caption, color: colors.textMuted, fontSize: 13 },
});
