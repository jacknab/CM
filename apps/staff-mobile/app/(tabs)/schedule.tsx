import { useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet,
  RefreshControl, ActivityIndicator, Platform, Alert, Modal,
  TextInput, Image, KeyboardAvoidingView, ScrollView, SafeAreaView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { apiGet, apiPost, apiPatch, apiPut } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { colors } from '@/constants/colors';
import { QRScannerModal } from '@/components/QRScannerModal';

type Appointment = {
  id: number;
  date: string;
  startTime: string;
  endTime?: string | null;
  status: string;
  service?: { id?: number; name?: string; duration?: number; price?: string } | null;
  client?: { id?: number; name?: string; phone?: string } | null;
  notes?: string | null;
};

function formatDate(d: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTime(timeStr: string): string {
  if (!timeStr) return '';
  const t = new Date(timeStr);
  if (isNaN(t.getTime())) {
    const parts = timeStr.split(':');
    if (parts.length >= 2) {
      const h = parseInt(parts[0] ?? '0', 10);
      const m = parts[1] ?? '00';
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 === 0 ? 12 : h % 12;
      return `${h12}:${m} ${ampm}`;
    }
    return timeStr;
  }
  return t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function statusColor(status: string): string {
  switch (status) {
    case 'confirmed': return colors.statusConfirmed;
    case 'pending': return colors.statusPending;
    case 'in_progress': return colors.statusInProgress;
    case 'awaiting_checkout': return colors.statusAwaitingCheckout;
    case 'completed': return colors.statusCompleted;
    case 'cancelled': return colors.statusCancelled;
    case 'no_show': return colors.statusNoShow;
    default: return colors.textMuted;
  }
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function AppointmentCard({ appt, onPress }: { appt: Appointment; onPress: () => void }) {
  const sc = statusColor(appt.status);
  const clientName = appt.client?.name ?? 'Walk-in';
  const serviceName = appt.service?.name ?? 'Service';
  const dur = appt.service?.duration;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, { borderLeftColor: sc }, pressed && { opacity: 0.8 }]}
      onPress={onPress}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTime}>{formatTime(appt.startTime)}</Text>
        <View style={[styles.badge, { backgroundColor: `${sc}22` }]}>
          <Text style={[styles.badgeText, { color: sc }]}>{statusLabel(appt.status)}</Text>
        </View>
      </View>
      <Text style={styles.clientName}>{clientName}</Text>
      <View style={styles.cardMeta}>
        <Ionicons name="cut-outline" size={13} color={colors.textMuted} />
        <Text style={styles.metaText}>{serviceName}</Text>
        {dur ? (
          <>
            <Text style={styles.metaDot}>·</Text>
            <Ionicons name="time-outline" size={13} color={colors.textMuted} />
            <Text style={styles.metaText}>{dur} min</Text>
          </>
        ) : null}
        {appt.service?.price ? (
          <>
            <Text style={styles.metaDot}>·</Text>
            <Text style={styles.metaText}>${appt.service.price}</Text>
          </>
        ) : null}
      </View>
      {appt.notes ? (
        <Text style={styles.cardNotes} numberOfLines={1}>{appt.notes}</Text>
      ) : null}
    </Pressable>
  );
}

// ─── Work Photo Upload Sheet ──────────────────────────────────────────────────

type PhotoUploadState = 'idle' | 'uploading' | 'success' | 'error';

function WorkPhotoSheet({
  appt,
  visible,
  onClose,
}: {
  appt: Appointment;
  visible: boolean;
  onClose: () => void;
}) {
  const [pickedUri, setPickedUri]     = useState<string | null>(null);
  const [caption,   setCaption]       = useState('');
  const [uploadState, setUploadState] = useState<PhotoUploadState>('idle');
  const [errorMsg,  setErrorMsg]      = useState('');

  const resetSheet = useCallback(() => {
    setPickedUri(null);
    setCaption('');
    setUploadState('idle');
    setErrorMsg('');
  }, []);

  const handleClose = useCallback(() => {
    resetSheet();
    onClose();
  }, [resetSheet, onClose]);

  const pickFromLibrary = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to upload work photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]) {
      setPickedUri(result.assets[0].uri);
      setUploadState('idle');
    }
  }, []);

  const takePhoto = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow camera access to take work photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]) {
      setPickedUri(result.assets[0].uri);
      setUploadState('idle');
    }
  }, []);

  const handleUpload = useCallback(async () => {
    if (!pickedUri) return;
    setUploadState('uploading');
    setErrorMsg('');

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Build FormData
      const formData = new FormData();
      const filename = pickedUri.split('/').pop() ?? 'photo.jpg';
      const mimeType = filename.endsWith('.png') ? 'image/png' : 'image/jpeg';

      (formData as any).append('photo', {
        uri:  pickedUri,
        name: filename,
        type: mimeType,
      } as any);

      if (appt.id)           formData.append('appointmentId', String(appt.id));
      if (appt.service?.id)  formData.append('serviceId',     String(appt.service.id));
      if (appt.client?.id)   formData.append('clientId',      String(appt.client.id));
      if (caption.trim())    formData.append('caption',       caption.trim());

      // Use raw fetch — must NOT set Content-Type so RN sets multipart/form-data boundary
      const { getApiBaseUrl, getAuthHeaders } = await import('@/lib/api');
      const baseUrl    = getApiBaseUrl();
      const authHdrs   = await getAuthHeaders();

      const resp = await fetch(`${baseUrl}/api/staff/me/work-photos`, {
        method:      'POST',
        body:        formData,
        credentials: 'include',
        headers:     authHdrs,
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error((body as any)?.message ?? `Upload failed (${resp.status})`);
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setUploadState('success');
    } catch (err: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setUploadState('error');
      setErrorMsg(err?.message ?? 'Upload failed. Please try again.');
    }
  }, [pickedUri, caption, appt]);

  const serviceName = appt.service?.name ?? 'service';
  const clientName  = appt.client?.name  ?? 'walk-in client';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={photo.overlay} onPress={handleClose}>
          <Pressable style={photo.panel} onPress={(e) => e.stopPropagation()}>
            <View style={photo.handle} />

            {uploadState === 'success' ? (
              // ── Success state ──────────────────────────────────────────────
              <View style={photo.successState}>
                <Ionicons name="checkmark-circle" size={56} color={colors.statusCompleted} />
                <Text style={photo.successTitle}>Photo Uploaded</Text>
                <Text style={photo.successSubtitle}>
                  It's been added to the Google Business Profile queue.
                </Text>
                <Pressable style={[photo.btn, photo.btnPrimary]} onPress={handleClose}>
                  <Text style={[photo.btnText, { color: colors.primary }]}>Done</Text>
                </Pressable>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {/* Header */}
                <Text style={photo.title}>Add Work Photo</Text>
                <Text style={photo.subtitle}>{serviceName} · {clientName}</Text>

                {/* Photo picker area */}
                {pickedUri ? (
                  <View style={photo.previewWrap}>
                    <Image source={{ uri: pickedUri }} style={photo.preview} resizeMode="cover" />
                    <Pressable style={photo.changePhotoBtn} onPress={pickFromLibrary}>
                      <Ionicons name="swap-horizontal" size={14} color={colors.primary} />
                      <Text style={photo.changePhotoText}>Change</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={photo.pickerArea}>
                    <Pressable style={photo.pickerBtn} onPress={takePhoto}>
                      <Ionicons name="camera-outline" size={26} color={colors.primary} />
                      <Text style={photo.pickerBtnText}>Take Photo</Text>
                    </Pressable>
                    <View style={photo.pickerDivider}>
                      <View style={photo.pickerLine} />
                      <Text style={photo.pickerOr}>or</Text>
                      <View style={photo.pickerLine} />
                    </View>
                    <Pressable style={photo.pickerBtn} onPress={pickFromLibrary}>
                      <Ionicons name="images-outline" size={26} color={colors.textSecondary} />
                      <Text style={[photo.pickerBtnText, { color: colors.textSecondary }]}>
                        Choose from Library
                      </Text>
                    </Pressable>
                  </View>
                )}

                {/* Caption */}
                {pickedUri ? (
                  <View style={photo.captionWrap}>
                    <Text style={photo.captionLabel}>Caption (optional)</Text>
                    <TextInput
                      style={photo.captionInput}
                      placeholder="Describe the look, style, or technique…"
                      placeholderTextColor={colors.textMuted}
                      value={caption}
                      onChangeText={setCaption}
                      multiline
                      numberOfLines={3}
                      maxLength={300}
                    />
                    <Text style={photo.captionCount}>{caption.length}/300</Text>
                  </View>
                ) : null}

                {/* Error */}
                {uploadState === 'error' ? (
                  <View style={photo.errorBox}>
                    <Ionicons name="alert-circle-outline" size={16} color={colors.statusCancelled} />
                    <Text style={photo.errorText}>{errorMsg}</Text>
                  </View>
                ) : null}

                {/* Actions */}
                <View style={{ gap: 10, marginTop: 8, marginBottom: 4 }}>
                  {pickedUri ? (
                    <Pressable
                      style={[
                        photo.btn,
                        photo.btnPrimary,
                        (!pickedUri || uploadState === 'uploading') && photo.btnDisabled,
                      ]}
                      onPress={handleUpload}
                      disabled={!pickedUri || uploadState === 'uploading'}
                    >
                      {uploadState === 'uploading' ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Ionicons name="cloud-upload-outline" size={18} color={colors.primary} />
                      )}
                      <Text style={[photo.btnText, { color: colors.primary }]}>
                        {uploadState === 'uploading' ? 'Uploading…' : 'Upload Photo'}
                      </Text>
                    </Pressable>
                  ) : null}
                  <Pressable style={[photo.btn, photo.btnSecondary]} onPress={handleClose}>
                    <Text style={[photo.btnText, { color: colors.textSecondary }]}>Cancel</Text>
                  </Pressable>
                </View>
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Appointment Ticket Screen ────────────────────────────────────────────────

type ClientDetail = {
  loyaltyPoints?: number;
  totalVisits?: number;
  lastVisitAt?: string | null;
};

type TicketTab = 'services' | 'addons' | 'products';

function formatLastVisit(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
}

function AppointmentSheet({
  appt,
  onClose,
  onCheckIn,
  onComplete,
  onAddPhoto,
  isUpdating,
  onOpenScanner,
}: {
  appt: Appointment;
  onClose: () => void;
  onCheckIn: (id: number) => void;
  onComplete: (id: number) => void;
  onAddPhoto: (appt: Appointment) => void;
  isUpdating: boolean;
  onOpenScanner?: () => void;
}) {
  const insets       = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TicketTab>('services');

  const clientId     = appt.client?.id;
  const clientName   = appt.client?.name ?? 'Walk-in';
  const serviceName  = appt.service?.name ?? 'Service';
  const dur          = appt.service?.duration;
  const price        = appt.service?.price;
  const sc           = statusColor(appt.status);

  // Fetch extended client detail (loyalty, visits, last visit)
  const { data: clientDetail } = useQuery<ClientDetail>({
    queryKey: ['/api/clients', clientId],
    queryFn: () => apiGet<ClientDetail>(`/api/clients/${clientId}`),
    enabled: !!clientId,
    staleTime: 60_000,
  });

  const loyaltyPoints = clientDetail?.loyaltyPoints ?? 0;
  const totalVisits   = clientDetail?.totalVisits ?? 0;
  const lastVisitAt   = clientDetail?.lastVisitAt;
  const isVip         = totalVisits >= 5;

  // Compute ticket total from service price
  const priceNum      = parseFloat(price ?? '0') || 0;
  const total         = priceNum;

  const canCheckIn    = ['confirmed', 'pending'].includes(appt.status);
  const canComplete   = ['in_progress', 'awaiting_checkout', 'checked_in'].includes(appt.status);
  const canAddPhoto   = ['in_progress', 'awaiting_checkout', 'completed'].includes(appt.status);

  const handleProceed = useCallback(() => {
    if (canCheckIn) {
      onCheckIn(appt.id);
      onClose();
    } else if (canComplete) {
      onComplete(appt.id);
      onClose();
    }
  }, [canCheckIn, canComplete, appt.id, onCheckIn, onComplete, onClose]);

  const proceedLabel = canCheckIn
    ? 'Check In'
    : canComplete
    ? 'Proceed to Checkout'
    : 'View Details';

  const tabs: { key: TicketTab; label: string }[] = [
    { key: 'services', label: 'SERVICES' },
    { key: 'addons',   label: 'ADD-ONS'  },
    { key: 'products', label: 'PRODUCTS' },
  ];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={sheet.root}>
        <SafeAreaView style={sheet.safeTop} />

        {/* ── Header ─────────────────────────────────────────────────── */}
        <View style={sheet.header}>
          <Pressable onPress={onClose} style={sheet.headerBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={sheet.headerTitle}>Add to Ticket</Text>
          <Pressable
            style={sheet.headerBtn}
            onPress={onOpenScanner}
            hitSlop={8}
          >
            <Ionicons name="scan-outline" size={20} color={colors.primary} />
            <Text style={sheet.scanLabel}>Scan</Text>
          </Pressable>
        </View>

        {/* ── Client Info ─────────────────────────────────────────────── */}
        <View style={sheet.clientSection}>
          <View style={sheet.clientLeft}>
            <View style={sheet.clientNameRow}>
              <Text style={sheet.clientNameText}>{clientName}</Text>
              {isVip && (
                <View style={sheet.vipBadge}>
                  <Ionicons name="star" size={10} color="#fff" />
                  <Text style={sheet.vipText}>VIP</Text>
                </View>
              )}
            </View>
            <Text style={sheet.lastVisit}>Last visit: {formatLastVisit(lastVisitAt)}</Text>
          </View>
          <View style={sheet.clientRight}>
            <Text style={sheet.clientStatText}>Loyalty Points: {loyaltyPoints}</Text>
            <Text style={sheet.clientStatText}>Total visits: {totalVisits}</Text>
          </View>
        </View>

        {/* ── Status badge strip ──────────────────────────────────────── */}
        <View style={[sheet.statusStrip, { backgroundColor: `${sc}18` }]}>
          <View style={[sheet.statusDot, { backgroundColor: sc }]} />
          <Text style={[sheet.statusStripText, { color: sc }]}>{statusLabel(appt.status)}</Text>
          <Text style={sheet.statusTime}>· {formatTime(appt.startTime)}</Text>
        </View>

        {/* ── Tabs ────────────────────────────────────────────────────── */}
        <View style={sheet.tabBar}>
          {tabs.map(t => (
            <Pressable
              key={t.key}
              style={sheet.tabItem}
              onPress={() => setActiveTab(t.key)}
            >
              <Text style={[sheet.tabLabel, activeTab === t.key && sheet.tabLabelActive]}>
                {t.label}
              </Text>
              {activeTab === t.key && <View style={sheet.tabUnderline} />}
            </Pressable>
          ))}
        </View>

        {/* ── Content ─────────────────────────────────────────────────── */}
        <ScrollView
          style={sheet.scroll}
          contentContainerStyle={sheet.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {activeTab === 'services' && (
            <>
              <Text style={sheet.sectionHeader}>Current Ticket (1)</Text>

              {/* Main service row */}
              <View style={sheet.ticketCard}>
                <View style={sheet.serviceRow}>
                  <View style={sheet.serviceLeft}>
                    <Text style={sheet.serviceNameText}>{serviceName}</Text>
                    {dur ? <Text style={sheet.serviceDur}>{dur} min</Text> : null}
                  </View>
                  {price ? (
                    <Text style={sheet.servicePrice}>${parseFloat(price).toFixed(2)}</Text>
                  ) : null}
                </View>

                {/* Notes as inline add-on */}
                {appt.notes ? (
                  <View style={sheet.addonsSection}>
                    <View style={sheet.addonsSectionHeader}>
                      <Text style={sheet.addonsSectionLabel}>Notes</Text>
                    </View>
                    <View style={sheet.addonRow}>
                      <Text style={sheet.addonName}>{appt.notes}</Text>
                    </View>
                  </View>
                ) : null}
              </View>

              {canAddPhoto && (
                <Pressable
                  style={sheet.addPhotoBtn}
                  onPress={() => { onClose(); onAddPhoto(appt); }}
                >
                  <Ionicons name="camera-outline" size={16} color={colors.primary} />
                  <Text style={sheet.addPhotoBtnText}>Add Work Photo</Text>
                </Pressable>
              )}
            </>
          )}

          {activeTab === 'addons' && (
            <View style={sheet.emptyTab}>
              <Ionicons name="add-circle-outline" size={40} color={colors.border} />
              <Text style={sheet.emptyTabTitle}>No add-ons</Text>
              <Text style={sheet.emptyTabBody}>Add-ons can be added when building the ticket at checkout.</Text>
            </View>
          )}

          {activeTab === 'products' && (
            <View style={sheet.emptyTab}>
              <Ionicons name="cube-outline" size={40} color={colors.border} />
              <Text style={sheet.emptyTabTitle}>No products</Text>
              <Text style={sheet.emptyTabBody}>Retail products sold during this visit will appear here.</Text>
            </View>
          )}
        </ScrollView>

        {/* ── Bottom Bar ──────────────────────────────────────────────── */}
        <View style={[sheet.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={sheet.totalBlock}>
            <Text style={sheet.totalLabel}>Total</Text>
            <Text style={sheet.totalAmount}>${total.toFixed(2)}</Text>
          </View>
          <Pressable
            style={sheet.saveBtn}
            onPress={onClose}
          >
            <Ionicons name="bookmark-outline" size={16} color={colors.textSecondary} />
            <Text style={sheet.saveBtnText}>Save Ticket</Text>
          </Pressable>
          <Pressable
            style={[sheet.proceedBtn, isUpdating && sheet.proceedBtnDisabled]}
            onPress={handleProceed}
            disabled={isUpdating || (!canCheckIn && !canComplete)}
          >
            {isUpdating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={sheet.proceedBtnText}>{proceedLabel}</Text>
                <Ionicons name="arrow-forward" size={16} color="#fff" />
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─── Schedule Screen ──────────────────────────────────────────────────────────

export default function ScheduleScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [scannerOpen, setScannerOpen]   = useState(false);
  const [checkingIn, setCheckingIn]     = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [isUpdating, setIsUpdating]     = useState(false);
  const [photoAppt, setPhotoAppt]       = useState<Appointment | null>(null);

  const dateStr = toDateStr(selectedDate);
  const isToday = toDateStr(new Date()) === dateStr;

  const { data, isLoading, refetch, isRefetching } = useQuery<Appointment[]>({
    queryKey: ['/api/appointments', dateStr, user?.id, user?.storeId],
    queryFn: () => {
      const params = new URLSearchParams({ date: dateStr });
      if (user?.id) params.set('staffId', String(user.id));
      if (user?.storeId) params.set('storeId', String(user.storeId));
      return apiGet<Appointment[]>(`/api/appointments?${params}`);
    },
    enabled: !!user,
  });

  const appointments = (data ?? []).sort((a, b) =>
    new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  const prevDay = useCallback(() => {
    setSelectedDate(d => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; });
  }, []);
  const nextDay = useCallback(() => {
    setSelectedDate(d => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; });
  }, []);
  const goToday = useCallback(() => setSelectedDate(new Date()), []);

  const handleCheckIn = useCallback(async (id: number) => {
    setIsUpdating(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await apiPatch(`/api/appointments/${id}`, { status: 'checked_in' });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refetch();
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', 'Could not check in this appointment.');
    } finally {
      setIsUpdating(false);
    }
  }, [refetch]);

  const handleComplete = useCallback(async (id: number) => {
    setIsUpdating(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await apiPatch(`/api/appointments/${id}`, { status: 'completed' });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refetch();
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', 'Could not complete this appointment.');
    } finally {
      setIsUpdating(false);
    }
  }, [refetch]);

  const handleAddPhoto = useCallback((appt: Appointment) => {
    setPhotoAppt(appt);
  }, []);

  // Handle a scanned QR code
  const handleQRScanned = useCallback(async (data: string) => {
    setScannerOpen(false);

    const token = data.startsWith('checkin:') ? data.replace('checkin:', '') : data;
    let extractedToken = token;
    try {
      const url = new URL(data);
      const match = url.pathname.match(/\/ticket\/([^/]+)/);
      if (match?.[1]) extractedToken = match[1];
    } catch { /* not a URL, use as-is */ }

    setCheckingIn(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await apiPut(`/api/public/kiosk/ticket/${encodeURIComponent(extractedToken)}/status`, {
        status: 'serving',
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refetch();
      Alert.alert('Checked In', 'Client has been checked in successfully.');
    } catch (e: unknown) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'QR Code Scanned',
        `Code: ${data.length > 80 ? data.slice(0, 80) + '…' : data}`,
        [{ text: 'OK' }]
      );
    } finally {
      setCheckingIn(false);
    }
  }, [refetch]);

  const topPad = insets.top + (Platform.OS === 'ios' ? 0 : 8);

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.screenTitle}>My Schedule</Text>
        <View style={styles.headerActions}>
          {!isToday && (
            <Pressable onPress={goToday} style={styles.todayBtn}>
              <Text style={styles.todayBtnText}>Today</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => setScannerOpen(true)}
            style={({ pressed }) => [styles.scanBtn, pressed && styles.scanBtnPressed]}
            disabled={checkingIn}
            hitSlop={6}
          >
            {checkingIn
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Ionicons name="qr-code-outline" size={22} color={colors.primary} />
            }
          </Pressable>
        </View>
      </View>

      {/* Date nav */}
      <View style={styles.dateNav}>
        <Pressable onPress={prevDay} style={styles.navBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
        </Pressable>
        <View style={styles.dateLabelWrap}>
          <Text style={styles.dateLabel}>{formatDate(selectedDate)}</Text>
          {isToday && <View style={styles.todayDot} />}
        </View>
        <Pressable onPress={nextDay} style={styles.navBtn} hitSlop={8}>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Summary pill */}
      {appointments.length > 0 && (
        <View style={styles.summaryPill}>
          <Ionicons name="calendar-outline" size={14} color={colors.primary} />
          <Text style={styles.summaryText}>
            {appointments.length} appointment{appointments.length !== 1 ? 's' : ''}
          </Text>
        </View>
      )}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={appointments}
          keyExtractor={a => String(a.id)}
          renderItem={({ item }) => (
            <AppointmentCard appt={item} onPress={() => setSelectedAppt(item)} />
          )}
          contentContainerStyle={[
            styles.listContent,
            appointments.length === 0 && styles.listContentEmpty,
          ]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={appointments.length > 0}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={52} color={colors.border} />
              <Text style={styles.emptyTitle}>No appointments</Text>
              <Text style={styles.emptyBody}>
                {isToday ? "You have a free day today." : "Nothing scheduled for this day."}
              </Text>
            </View>
          }
        />
      )}

      {/* Appointment action sheet */}
      {selectedAppt && (
        <AppointmentSheet
          appt={selectedAppt}
          onClose={() => setSelectedAppt(null)}
          onCheckIn={handleCheckIn}
          onComplete={handleComplete}
          onAddPhoto={handleAddPhoto}
          isUpdating={isUpdating}
          onOpenScanner={() => { setSelectedAppt(null); setScannerOpen(true); }}
        />
      )}

      {/* Work photo upload sheet */}
      {photoAppt && (
        <WorkPhotoSheet
          appt={photoAppt}
          visible={!!photoAppt}
          onClose={() => setPhotoAppt(null)}
        />
      )}

      {/* QR Scanner modal */}
      <QRScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanned={handleQRScanned}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 },
  screenTitle: { fontSize: 26, fontWeight: '700', color: colors.text, fontFamily: 'DMSans_700Bold' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  todayBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: `${colors.primary}18` },
  todayBtnText: { fontSize: 13, color: colors.primary, fontWeight: '600', fontFamily: 'DMSans_700Bold' },
  scanBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: `${colors.primary}18` },
  scanBtnPressed: { opacity: 0.7 },
  dateNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 12 },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  dateLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateLabel: { fontSize: 16, color: colors.text, fontWeight: '600', fontFamily: 'DMSans_700Bold' },
  todayDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.primary },
  summaryPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginHorizontal: 20, marginBottom: 10, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: `${colors.primary}12` },
  summaryText: { fontSize: 13, color: colors.primary, fontFamily: 'DMSans_500Medium' },
  listContent: { paddingHorizontal: 20, paddingBottom: 24 },
  listContentEmpty: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 16, marginBottom: 12, borderLeftWidth: 4, borderWidth: 1, borderColor: colors.border },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  cardTime: { fontSize: 13, color: colors.textSecondary, fontFamily: 'DMSans_500Medium' },
  badge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '600', fontFamily: 'DMSans_700Bold' },
  clientName: { fontSize: 17, fontWeight: '700', color: colors.text, fontFamily: 'DMSans_700Bold', marginBottom: 6 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  metaText: { fontSize: 13, color: colors.textMuted, fontFamily: 'DMSans_400Regular' },
  metaDot: { fontSize: 13, color: colors.textMuted },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, fontFamily: 'DMSans_700Bold' },
  emptyBody: { fontSize: 14, color: colors.textMuted, fontFamily: 'DMSans_400Regular', textAlign: 'center', maxWidth: 240, lineHeight: 20 },
  cardNotes: { fontSize: 12, color: colors.textMuted, fontFamily: 'DMSans_400Regular', marginTop: 6, lineHeight: 16 },
});

const PURPLE = '#7C3AED';

const sheet = StyleSheet.create({
  // Full-screen container
  root:               { flex: 1, backgroundColor: colors.background },
  safeTop:            { backgroundColor: colors.background },

  // Header
  header:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerBtn:          { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 56 },
  headerTitle:        { fontSize: 17, fontWeight: '700', color: colors.text, fontFamily: 'DMSans_700Bold', flex: 1, textAlign: 'center' },
  scanLabel:          { fontSize: 13, color: colors.primary, fontFamily: 'DMSans_700Bold' },

  // Client section
  clientSection:      { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  clientLeft:         { flex: 1, gap: 4 },
  clientRight:        { alignItems: 'flex-end', gap: 4 },
  clientNameRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  clientNameText:     { fontSize: 20, fontWeight: '700', color: colors.text, fontFamily: 'DMSans_700Bold' },
  vipBadge:           { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: PURPLE, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  vipText:            { fontSize: 11, fontWeight: '700', color: '#fff', fontFamily: 'DMSans_700Bold' },
  lastVisit:          { fontSize: 13, color: colors.textSecondary, fontFamily: 'DMSans_400Regular' },
  clientStatText:     { fontSize: 13, color: colors.textSecondary, fontFamily: 'DMSans_400Regular' },

  // Status strip
  statusStrip:        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 8 },
  statusDot:          { width: 6, height: 6, borderRadius: 3 },
  statusStripText:    { fontSize: 13, fontWeight: '600', fontFamily: 'DMSans_700Bold' },
  statusTime:         { fontSize: 13, color: colors.textMuted, fontFamily: 'DMSans_400Regular' },

  // Tabs
  tabBar:             { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  tabItem:            { flex: 1, alignItems: 'center', paddingVertical: 12, position: 'relative' },
  tabLabel:           { fontSize: 12, fontWeight: '600', color: colors.textMuted, fontFamily: 'DMSans_700Bold', letterSpacing: 0.5 },
  tabLabelActive:     { color: PURPLE },
  tabUnderline:       { position: 'absolute', bottom: -1, left: 8, right: 8, height: 2, borderRadius: 1, backgroundColor: PURPLE },

  // Scroll content
  scroll:             { flex: 1 },
  scrollContent:      { padding: 16, paddingBottom: 24 },

  // Section header
  sectionHeader:      { fontSize: 14, fontWeight: '600', color: colors.textSecondary, fontFamily: 'DMSans_700Bold', marginBottom: 12 },

  // Ticket card
  ticketCard:         { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: 12 },
  serviceRow:         { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', padding: 16 },
  serviceLeft:        { flex: 1, gap: 3 },
  serviceNameText:    { fontSize: 16, fontWeight: '600', color: colors.text, fontFamily: 'DMSans_700Bold' },
  serviceDur:         { fontSize: 13, color: colors.textMuted, fontFamily: 'DMSans_400Regular' },
  servicePrice:       { fontSize: 16, fontWeight: '600', color: colors.text, fontFamily: 'DMSans_700Bold' },

  // Add-ons subsection
  addonsSection:      { borderTopWidth: 1, borderTopColor: colors.border },
  addonsSectionHeader:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: `${PURPLE}14` },
  addonsSectionLabel: { fontSize: 13, fontWeight: '600', color: PURPLE, fontFamily: 'DMSans_700Bold' },
  addonsSectionCount: { fontSize: 12, color: PURPLE, fontFamily: 'DMSans_700Bold' },
  addonRow:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
  addonName:          { fontSize: 14, color: colors.textSecondary, fontFamily: 'DMSans_400Regular', flex: 1 },
  addonPrice:         { fontSize: 14, color: colors.text, fontFamily: 'DMSans_700Bold' },

  // Add photo
  addPhotoBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  addPhotoBtnText:    { fontSize: 14, fontWeight: '600', color: colors.primary, fontFamily: 'DMSans_700Bold' },

  // Empty tab
  emptyTab:           { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTabTitle:      { fontSize: 16, fontWeight: '700', color: colors.text, fontFamily: 'DMSans_700Bold' },
  emptyTabBody:       { fontSize: 13, color: colors.textMuted, textAlign: 'center', maxWidth: 240, lineHeight: 19, fontFamily: 'DMSans_400Regular' },

  // Bottom bar
  bottomBar:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, gap: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
  totalBlock:         { flex: 0, marginRight: 4 },
  totalLabel:         { fontSize: 12, color: colors.textMuted, fontFamily: 'DMSans_400Regular' },
  totalAmount:        { fontSize: 20, fontWeight: '700', color: colors.text, fontFamily: 'DMSans_700Bold' },
  saveBtn:            { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  saveBtnText:        { fontSize: 14, fontWeight: '600', color: colors.textSecondary, fontFamily: 'DMSans_700Bold' },
  proceedBtn:         { flex: 1.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 13, backgroundColor: PURPLE },
  proceedBtnDisabled: { opacity: 0.45 },
  proceedBtnText:     { fontSize: 14, fontWeight: '700', color: '#fff', fontFamily: 'DMSans_700Bold' },
});

const photo = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#00000070', justifyContent: 'flex-end' },
  panel: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: '92%',
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text, fontFamily: 'DMSans_700Bold', marginBottom: 4 },
  subtitle: { fontSize: 14, color: colors.textSecondary, fontFamily: 'DMSans_400Regular', marginBottom: 20 },
  pickerArea: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, borderStyle: 'dashed', padding: 20, gap: 8, marginBottom: 20 },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.background },
  pickerBtnText: { fontSize: 15, fontWeight: '600', color: colors.primary, fontFamily: 'DMSans_700Bold' },
  pickerDivider: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  pickerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  pickerOr: { fontSize: 12, color: colors.textMuted, fontFamily: 'DMSans_400Regular' },
  previewWrap: { borderRadius: 16, overflow: 'hidden', marginBottom: 16, position: 'relative' },
  preview: { width: '100%', height: 200, borderRadius: 16 },
  changePhotoBtn: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  changePhotoText: { fontSize: 12, color: '#fff', fontFamily: 'DMSans_500Medium' },
  captionWrap: { marginBottom: 16 },
  captionLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, fontFamily: 'DMSans_700Bold', marginBottom: 8 },
  captionInput: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, fontSize: 14, color: colors.text, fontFamily: 'DMSans_400Regular', minHeight: 80, textAlignVertical: 'top' },
  captionCount: { fontSize: 11, color: colors.textMuted, textAlign: 'right', marginTop: 4, fontFamily: 'DMSans_400Regular' },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: `${colors.statusCancelled}18`, borderRadius: 10, padding: 12, marginBottom: 12 },
  errorText: { flex: 1, fontSize: 13, color: colors.statusCancelled, fontFamily: 'DMSans_400Regular' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 15 },
  btnPrimary: { backgroundColor: `${colors.primary}18` },
  btnSecondary: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  btnDisabled: { opacity: 0.45 },
  btnText: { fontSize: 15, fontWeight: '700', fontFamily: 'DMSans_700Bold' },
  successState: { alignItems: 'center', paddingVertical: 24, gap: 12 },
  successTitle: { fontSize: 22, fontWeight: '700', color: colors.text, fontFamily: 'DMSans_700Bold' },
  successSubtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', fontFamily: 'DMSans_400Regular', maxWidth: 260, lineHeight: 20 },
});
