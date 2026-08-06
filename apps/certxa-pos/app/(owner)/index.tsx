import { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { fetchAppointments, fetchStaff, updateAppointmentStatus, type Appointment, type StaffMember } from '@/lib/api';
import { colors } from '@/constants/colors';
import { Badge } from '@/components/ui/Badge';

const HOUR_H = 80;
const START_HOUR = 7;
const END_HOUR = 22;
const TIME_LABEL_W = 52;
const MIN_COL_W = 140;

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'pm' : 'am';
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')}${ampm}`;
}

function timeToMinutes(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function minutesToY(minutes: number): number {
  return ((minutes - START_HOUR * 60) / 60) * HOUR_H;
}

function statusVariant(status: Appointment['status']): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'confirmed': return 'info';
    case 'checked_in': return 'success';
    case 'completed': return 'success';
    case 'no_show': return 'danger';
    case 'cancelled': return 'danger';
    default: return 'default';
  }
}

const STAFF_COLORS = [
  '#7C3AED', '#06B6D4', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#3B82F6', '#EC4899', '#14B8A6', '#F97316',
];

type ApptDetailProps = {
  appt: Appointment | null;
  onClose: () => void;
  onCheckIn: (id: number) => void;
  onNoShow: (id: number) => void;
  onComplete: (id: number) => void;
  onCharge: (appt: Appointment) => void;
};

function AppointmentDetailModal({ appt, onClose, onCheckIn, onNoShow, onComplete, onCharge }: ApptDetailProps) {
  if (!appt) return null;
  const canCharge = appt.status !== 'cancelled';
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalClient}>{appt.clientName}</Text>
          <Text style={styles.modalService}>{appt.serviceName}</Text>
          <View style={styles.modalRow}>
            <Ionicons name="time-outline" size={15} color={colors.textSecondary} />
            <Text style={styles.modalMeta}>
              {formatTime(appt.startTime)} – {formatTime(appt.endTime)}
            </Text>
          </View>
          {appt.staffName && (
            <View style={styles.modalRow}>
              <Ionicons name="person-outline" size={15} color={colors.textSecondary} />
              <Text style={styles.modalMeta}>{appt.staffName}</Text>
            </View>
          )}
          {appt.price > 0 && (
            <View style={styles.modalRow}>
              <Ionicons name="cash-outline" size={15} color={colors.textSecondary} />
              <Text style={styles.modalMeta}>${appt.price.toFixed(2)}</Text>
            </View>
          )}
          <View style={[styles.modalRow, { marginBottom: 24 }]}>
            <Badge
              label={appt.status.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              variant={statusVariant(appt.status)}
              size="md"
            />
          </View>

          {appt.status === 'scheduled' || appt.status === 'confirmed' ? (
            <View style={styles.actionRow}>
              <Pressable
                style={[styles.actionBtn, { backgroundColor: colors.successMuted }]}
                onPress={() => { onCheckIn(appt.id); onClose(); }}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color={colors.success} />
                <Text style={[styles.actionBtnText, { color: colors.success }]}>Check In</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, { backgroundColor: colors.dangerMuted }]}
                onPress={() => { onNoShow(appt.id); onClose(); }}
              >
                <Ionicons name="close-circle-outline" size={18} color={colors.danger} />
                <Text style={[styles.actionBtnText, { color: colors.danger }]}>No Show</Text>
              </Pressable>
            </View>
          ) : appt.status === 'checked_in' ? (
            <Pressable
              style={[styles.actionBtn, { backgroundColor: colors.primaryMuted, alignSelf: 'stretch' }]}
              onPress={() => { onComplete(appt.id); onClose(); }}
            >
              <Ionicons name="checkmark-done-outline" size={18} color={colors.primary} />
              <Text style={[styles.actionBtnText, { color: colors.primary }]}>Mark Complete</Text>
            </Pressable>
          ) : null}

          {canCharge && (
            <Pressable
              style={[styles.actionBtn, { backgroundColor: colors.primaryMuted, alignSelf: 'stretch' }]}
              onPress={() => { onCharge(appt); onClose(); }}
            >
              <Ionicons name="flash-outline" size={18} color={colors.primary} />
              <Text style={[styles.actionBtnText, { color: colors.primary }]}>
                Charge ${appt.price > 0 ? appt.price.toFixed(2) : '…'}
              </Text>
            </Pressable>
          )}

          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Close</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

export default function CalendarScreen() {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const qc = useQueryClient();
  const router = useRouter();
  const [date, setDate] = useState(new Date());
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);

  const dateStr = formatDate(date);
  const storeId = user?.storeId ?? 0;

  const colW = Math.max(MIN_COL_W, Math.floor((width - TIME_LABEL_W - 16) / Math.min(5, 3)));

  const { data: staff = [], isLoading: staffLoading } = useQuery({
    queryKey: ['staff', storeId],
    queryFn: () => fetchStaff(storeId),
    enabled: !!storeId,
  });

  const { data: appointments = [], isLoading: apptLoading } = useQuery({
    queryKey: ['appointments', storeId, dateStr],
    queryFn: () => fetchAppointments(storeId, dateStr),
    enabled: !!storeId,
    refetchInterval: 60_000,
  });

  const staffWithColors = staff.map((s, i) => ({ ...s, color: STAFF_COLORS[i % STAFF_COLORS.length] }));

  function getApptsByStaff(staffId: number): Appointment[] {
    return appointments.filter((a) => a.staffId === staffId);
  }

  function getUnassigned(): Appointment[] {
    return appointments.filter((a) => !a.staffId);
  }

  function moveDate(days: number) {
    setDate((d) => {
      const nd = new Date(d);
      nd.setDate(nd.getDate() + days);
      return nd;
    });
  }

  const handleStatusUpdate = useCallback(async (id: number, status: Appointment['status']) => {
    try {
      await updateAppointmentStatus(id, status);
      qc.invalidateQueries({ queryKey: ['appointments', storeId, dateStr] });
    } catch {
      Alert.alert('Error', 'Could not update appointment status.');
    }
  }, [storeId, dateStr, qc]);

  const handleCharge = useCallback((appt: Appointment) => {
    router.push({
      pathname: '/(owner)/pos/payment',
      params: {
        subtotal: String(appt.price ?? 0),
        clientId: String(appt.clientId ?? ''),
        clientName: appt.clientName,
        appointmentId: String(appt.id),
        cartJson: JSON.stringify([{ name: appt.serviceName, price: appt.price, qty: 1 }]),
      },
    });
  }, [router]);

  const totalHours = END_HOUR - START_HOUR;
  const gridH = totalHours * HOUR_H;

  const hours = Array.from({ length: totalHours }, (_, i) => i + START_HOUR);

  const dateLabel = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const isToday = formatDate(new Date()) === dateStr;

  const allStaff: (StaffMember & { color: string; isUnassigned?: boolean })[] = [
    ...staffWithColors,
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.dateNav}>
          <Pressable style={styles.navBtn} onPress={() => moveDate(-1)}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => setDate(new Date())} style={styles.datePill}>
            <Text style={styles.dateText}>{dateLabel}</Text>
            {isToday && <View style={styles.todayDot} />}
          </Pressable>
          <Pressable style={styles.navBtn} onPress={() => moveDate(1)}>
            <Ionicons name="chevron-forward" size={20} color={colors.text} />
          </Pressable>
        </View>
        <Pressable style={styles.bookApptBtn} onPress={() => router.push('/(owner)/appointment/new')}>
          <Ionicons name="calendar-outline" size={16} color={colors.primary} />
          <Text style={styles.bookApptText}>Book</Text>
        </Pressable>
        <Pressable style={styles.newApptBtn} onPress={() => router.push('/(owner)/pos/')}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.newApptText}>New</Text>
        </Pressable>
      </View>

      {staffLoading || apptLoading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {/* Time labels column */}
          <View style={{ flexDirection: 'row' }}>
            <View style={{ width: TIME_LABEL_W }}>
              {/* Staff header spacer */}
              <View style={styles.staffHeaderSpacer} />
              <ScrollView scrollEnabled={false} style={{ height: gridH }}>
                {hours.map((h) => (
                  <View key={h} style={[styles.timeCell, { height: HOUR_H }]}>
                    <Text style={styles.timeLabel}>
                      {h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </View>

            {/* Staff columns */}
            <ScrollView
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              style={{ height: '100%' }}
            >
              {/* Staff headers */}
              <View style={styles.staffHeaderRow}>
                {allStaff.map((s) => (
                  <View key={s.id} style={[styles.staffHeader, { width: colW, borderLeftColor: s.color }]}>
                    <Text style={styles.staffName} numberOfLines={1}>{s.name}</Text>
                  </View>
                ))}
                {getUnassigned().length > 0 && (
                  <View style={[styles.staffHeader, { width: colW, borderLeftColor: colors.border }]}>
                    <Text style={styles.staffName}>Unassigned</Text>
                  </View>
                )}
              </View>

              {/* Grid */}
              <View style={{ flexDirection: 'row', height: gridH }}>
                {allStaff.map((s) => (
                  <View key={s.id} style={[styles.col, { width: colW, height: gridH }]}>
                    {/* Hour lines */}
                    {hours.map((h) => (
                      <View key={h} style={[styles.hourLine, { top: (h - START_HOUR) * HOUR_H }]} />
                    ))}
                    {/* Appointments */}
                    {getApptsByStaff(s.id).map((a) => {
                      const startMin = timeToMinutes(a.startTime);
                      const endMin = timeToMinutes(a.endTime);
                      const top = minutesToY(startMin);
                      const height = Math.max(24, ((endMin - startMin) / 60) * HOUR_H - 4);
                      return (
                        <Pressable
                          key={a.id}
                          style={[styles.apptBlock, { top, height, backgroundColor: s.color + '28', borderLeftColor: s.color }]}
                          onPress={() => setSelectedAppt(a)}
                        >
                          <Text style={[styles.apptClient, { color: s.color }]} numberOfLines={1}>
                            {a.clientName}
                          </Text>
                          <Text style={styles.apptService} numberOfLines={1}>
                            {a.serviceName}
                          </Text>
                          {height > 44 && (
                            <Text style={styles.apptTime}>
                              {formatTime(a.startTime)}
                            </Text>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                ))}

                {/* Unassigned column */}
                {getUnassigned().length > 0 && (
                  <View style={[styles.col, { width: colW, height: gridH }]}>
                    {hours.map((h) => (
                      <View key={h} style={[styles.hourLine, { top: (h - START_HOUR) * HOUR_H }]} />
                    ))}
                    {getUnassigned().map((a) => {
                      const startMin = timeToMinutes(a.startTime);
                      const endMin = timeToMinutes(a.endTime);
                      const top = minutesToY(startMin);
                      const height = Math.max(24, ((endMin - startMin) / 60) * HOUR_H - 4);
                      return (
                        <Pressable
                          key={a.id}
                          style={[styles.apptBlock, { top, height, backgroundColor: colors.cardAlt, borderLeftColor: colors.border }]}
                          onPress={() => setSelectedAppt(a)}
                        >
                          <Text style={[styles.apptClient, { color: colors.text }]} numberOfLines={1}>
                            {a.clientName}
                          </Text>
                          <Text style={styles.apptService} numberOfLines={1}>
                            {a.serviceName}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        </ScrollView>
      )}

      <AppointmentDetailModal
        appt={selectedAppt}
        onClose={() => setSelectedAppt(null)}
        onCheckIn={(id) => handleStatusUpdate(id, 'checked_in')}
        onNoShow={(id) => handleStatusUpdate(id, 'no_show')}
        onComplete={(id) => handleStatusUpdate(id, 'completed')}
        onCharge={handleCharge}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dateNav: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  datePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  dateText: { fontSize: 16, fontWeight: '700', color: colors.text },
  todayDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  newApptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  newApptText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  bookApptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1.5,
    borderColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginRight: 6,
  },
  bookApptText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  staffHeaderSpacer: { height: 52, borderBottomWidth: 1, borderBottomColor: colors.border },
  staffHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  staffHeader: {
    height: 52,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderLeftWidth: 3,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  staffName: { fontSize: 13, fontWeight: '700', color: colors.text },
  col: {
    position: 'relative',
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  hourLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.border,
  },
  timeCell: { justifyContent: 'flex-start', paddingTop: 4, paddingRight: 6, alignItems: 'flex-end' },
  timeLabel: { fontSize: 11, color: colors.textMuted },
  apptBlock: {
    position: 'absolute',
    left: 4,
    right: 4,
    borderRadius: 6,
    borderLeftWidth: 3,
    padding: 6,
    overflow: 'hidden',
  },
  apptClient: { fontSize: 12, fontWeight: '700' },
  apptService: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
  apptTime: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  modalOverlay: {
    flex: 1,
    backgroundColor: '#00000080',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalClient: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 4 },
  modalService: { fontSize: 16, color: colors.textSecondary, marginBottom: 12 },
  modalRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  modalMeta: { fontSize: 14, color: colors.textSecondary },
  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
  },
  actionBtnText: { fontSize: 15, fontWeight: '700' },
  closeBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 8,
  },
  closeBtnText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
});
