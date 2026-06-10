import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
  addWeeks,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography, iconSize } from '../../theme';

const WEEK_OPTS = { weekStartsOn: 1 as const };

type StripProps = {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  minDate: Date;
};

export function DiaryWeekStrip({ selectedDate, onSelectDate, minDate }: StripProps) {
  const weekStart = startOfWeek(selectedDate, WEEK_OPTS);
  const weekEnd = endOfWeek(selectedDate, WEEK_OPTS);
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const goPrev = () => onSelectDate(subWeeks(selectedDate, 1));
  const goNext = () => onSelectDate(addWeeks(selectedDate, 1));

  return (
    <View style={stripStyles.wrap}>
      <Pressable
        onPress={goPrev}
        style={({ pressed }) => [stripStyles.arrow, pressed && stripStyles.arrowPressed]}
        hitSlop={10}
        accessibilityLabel="Semana anterior"
      >
        <Ionicons name="chevron-back" size={iconSize.md} color={colors.textSecondary} />
      </Pressable>
      <View style={stripStyles.daysRow}>
        {days.map((d) => {
          const disabled = isBefore(startOfDay(d), startOfDay(minDate));
          const sel = isSameDay(d, selectedDate);
          const today = isToday(d);
          return (
            <Pressable
              key={d.toISOString()}
              disabled={disabled}
              onPress={() => onSelectDate(d)}
              style={({ pressed }) => [
                stripStyles.dayCell,
                sel && stripStyles.dayCellSelected,
                today && !sel && stripStyles.dayCellToday,
                disabled && stripStyles.dayCellDisabled,
                pressed && !disabled && stripStyles.dayCellPressed,
              ]}
              accessibilityState={{ selected: sel, disabled }}
              accessibilityLabel={format(d, "EEEE d 'de' MMMM", { locale: es })}
            >
              <Text style={[stripStyles.dayName, disabled && stripStyles.muted]} numberOfLines={1}>
                {format(d, 'EEE', { locale: es }).replace('.', '')}
              </Text>
              <Text style={[stripStyles.dayNum, sel && stripStyles.dayNumSelected, disabled && stripStyles.muted]}>
                {format(d, 'd')}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        onPress={goNext}
        style={({ pressed }) => [stripStyles.arrow, pressed && stripStyles.arrowPressed]}
        hitSlop={10}
        accessibilityLabel="Semana siguiente"
      >
        <Ionicons name="chevron-forward" size={iconSize.md} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const WEEKDAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export type DayStatus = 'done' | 'partial' | 'missed';

type MonthProps = {
  visibleMonth: Date;
  selectedDate: Date;
  minDate: Date;
  onSelectDate: (d: Date) => void;
  onChangeVisibleMonth: (d: Date) => void;
  /** Estado de cumplimiento por día, indexado por 'yyyy-MM-dd'. Los días sin entrada quedan neutros. */
  dayStatuses?: Record<string, DayStatus>;
};

export function DiaryMonthGrid({
  visibleMonth,
  selectedDate,
  minDate,
  onSelectDate,
  onChangeVisibleMonth,
  dayStatuses,
}: MonthProps) {
  const monthStart = startOfMonth(visibleMonth);
  const monthEnd = endOfMonth(visibleMonth);
  const gridStart = startOfWeek(monthStart, WEEK_OPTS);
  const gridEnd = endOfWeek(monthEnd, WEEK_OPTS);
  const cells = eachDayOfInterval({ start: gridStart, end: gridEnd });

  return (
    <View style={monthStyles.container}>
      <View style={monthStyles.nav}>
        <Pressable
          onPress={() => onChangeVisibleMonth(subMonths(visibleMonth, 1))}
          style={({ pressed }) => [monthStyles.navBtn, pressed && monthStyles.navBtnPressed]}
          hitSlop={8}
          accessibilityLabel="Mes anterior"
        >
          <Ionicons name="chevron-back" size={iconSize.lg} color={colors.text} />
        </Pressable>
        <Text style={monthStyles.navTitle}>{format(visibleMonth, 'LLLL yyyy', { locale: es })}</Text>
        <Pressable
          onPress={() => onChangeVisibleMonth(addMonths(visibleMonth, 1))}
          style={({ pressed }) => [monthStyles.navBtn, pressed && monthStyles.navBtnPressed]}
          hitSlop={8}
          accessibilityLabel="Mes siguiente"
        >
          <Ionicons name="chevron-forward" size={iconSize.lg} color={colors.text} />
        </Pressable>
      </View>
      <View style={monthStyles.weekdayRow}>
        {WEEKDAY_LABELS.map((l) => (
          <Text key={l} style={monthStyles.weekdayHdr}>
            {l}
          </Text>
        ))}
      </View>
      <View style={monthStyles.grid}>
        {cells.map((d) => {
          const inMonth = isSameMonth(d, visibleMonth);
          const disabled = isBefore(startOfDay(d), startOfDay(minDate));
          const sel = isSameDay(d, selectedDate);
          const today = isToday(d);
          const key = format(d, 'yyyy-MM-dd');
          const status = dayStatuses?.[key];
          const isFuture = isBefore(startOfDay(new Date()), startOfDay(d));
          const statusColor =
            status === 'done'
              ? colors.success
              : status === 'partial'
              ? colors.warning
              : status === 'missed'
              ? colors.error
              : isFuture
              ? colors.textTertiary
              : undefined;
          const statusLabel =
            status === 'done'
              ? 'cumplido'
              : status === 'partial'
              ? 'a medias'
              : status === 'missed'
              ? 'no cumplido'
              : isFuture
              ? 'pendiente'
              : '';
          return (
            <Pressable
              key={d.toISOString()}
              disabled={disabled}
              onPress={() => {
                onSelectDate(d);
              }}
              style={({ pressed }) => [
                monthStyles.cell,
                !inMonth && monthStyles.cellOutMonth,
                sel && monthStyles.cellSelected,
                today && !sel && monthStyles.cellToday,
                disabled && monthStyles.cellDisabled,
                pressed && !disabled && monthStyles.cellPressed,
              ]}
              accessibilityState={{ selected: sel, disabled }}
              accessibilityLabel={
                statusLabel
                  ? `${format(d, "EEEE d 'de' MMMM yyyy", { locale: es })}, ${statusLabel}`
                  : format(d, "EEEE d 'de' MMMM yyyy", { locale: es })
              }
            >
              <Text
                style={[
                  monthStyles.cellText,
                  !inMonth && monthStyles.cellTextMuted,
                  sel && monthStyles.cellTextSelected,
                  disabled && monthStyles.cellTextDisabled,
                ]}
              >
                {format(d, 'd')}
              </Text>
              {statusColor ? (
                <View
                  style={[
                    monthStyles.statusDot,
                    { backgroundColor: statusColor },
                    !inMonth && monthStyles.statusDotMuted,
                  ]}
                />
              ) : null}
            </Pressable>
          );
        })}
      </View>
      <View style={monthStyles.legendRow}>
        <View style={monthStyles.legendItem}>
          <View style={[monthStyles.legendDot, { backgroundColor: colors.success }]} />
          <Text style={monthStyles.legendText}>Cumplido</Text>
        </View>
        <View style={monthStyles.legendItem}>
          <View style={[monthStyles.legendDot, { backgroundColor: colors.warning }]} />
          <Text style={monthStyles.legendText}>A medias</Text>
        </View>
        <View style={monthStyles.legendItem}>
          <View style={[monthStyles.legendDot, { backgroundColor: colors.error }]} />
          <Text style={monthStyles.legendText}>No cumplido</Text>
        </View>
      </View>
    </View>
  );
}

const stripStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  arrow: {
    padding: spacing.sm,
    borderRadius: borderRadius.md,
  },
  arrowPressed: { opacity: 0.7 },
  daysRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 2,
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    minWidth: 0,
  },
  dayCellSelected: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
  },
  dayCellToday: {
    borderColor: colors.borderStrong,
  },
  dayCellDisabled: { opacity: 0.35 },
  dayCellPressed: { opacity: 0.85 },
  dayName: {
    ...typography.caption,
    fontSize: 10,
    color: colors.textMuted,
    textTransform: 'capitalize',
  },
  dayNum: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
    marginTop: 2,
  },
  dayNumSelected: { color: colors.primaryLight },
  muted: { color: colors.textTertiary },
});

const monthStyles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  navBtn: { padding: spacing.xs, borderRadius: borderRadius.md },
  navBtnPressed: { opacity: 0.75 },
  navTitle: {
    ...typography.h3,
    color: colors.text,
    textTransform: 'capitalize',
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  weekdayHdr: {
    flex: 1,
    textAlign: 'center',
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: '14.2857%',
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingVertical: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 3,
  },
  statusDotMuted: { opacity: 0.45 },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '500',
  },
  cellOutMonth: { opacity: 0.35 },
  cellSelected: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
  },
  cellToday: { borderColor: colors.borderStrong },
  cellDisabled: { opacity: 0.25 },
  cellPressed: { opacity: 0.88 },
  cellText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  cellTextMuted: { color: colors.textMuted },
  cellTextSelected: { color: colors.primaryLight },
  cellTextDisabled: { color: colors.textTertiary },
});
