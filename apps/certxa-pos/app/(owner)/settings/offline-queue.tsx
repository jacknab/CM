import { useState, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { createPaymentIntent, capturePaymentIntent } from '@/lib/api';
import {
  getQueue, removeFromQueue, clearQueue, syncQueue, type QueuedPayment,
} from '@/lib/offlineQueue';
import { colors } from '@/constants/colors';

const METHOD_LABELS: Record<QueuedPayment['method'], string> = {
  tap_to_pay: 'Tap to Pay',
  terminal: 'M2 Reader',
  manual: 'Manual Card',
  cash: 'Cash',
};

const METHOD_ICONS: Record<QueuedPayment['method'], string> = {
  tap_to_pay: 'phone-portrait-outline',
  terminal: 'hardware-chip-outline',
  manual: 'card-outline',
  cash: 'cash-outline',
};

function fmtCurrency(cents: number): string {
  return `$${cents.toFixed(2)}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function OfflineQueueScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const { data: queue = [], isLoading, refetch } = useQuery({
    queryKey: ['offline-queue'],
    queryFn: getQueue,
    refetchInterval: 5000,
  });

  const syncAll = useMutation({
    mutationFn: async () => {
      const result = await syncQueue(
        async (payment) => {
          if (payment.method === 'cash') {
            await new Promise((r) => setTimeout(r, 300));
            return;
          }
          const { paymentIntentId } = await createPaymentIntent({
            storeId: payment.storeId,
            amount: Math.round(payment.amount * 100),
            tipAmount: Math.round((payment.tipAmount ?? 0) * 100),
            clientId: payment.clientId,
            appointmentId: payment.appointmentId,
          });
          await capturePaymentIntent(paymentIntentId);
        },
      );
      return result;
    },
    onSuccess: ({ synced, failed }) => {
      refetch();
      qc.invalidateQueries({ queryKey: ['appointments'] });
      if (failed === 0) {
        Alert.alert('All Synced', `${synced} payment${synced !== 1 ? 's' : ''} processed successfully.`);
      } else {
        Alert.alert('Partial Sync', `${synced} succeeded, ${failed} failed. Failed payments will retry automatically.`);
      }
    },
    onError: (err: Error) => {
      Alert.alert('Sync Failed', err.message ?? 'Could not reach the server.');
    },
  });

  const retryOne = useCallback(async (payment: QueuedPayment) => {
    setSyncingId(payment.id);
    try {
      if (payment.method !== 'cash') {
        const { paymentIntentId } = await createPaymentIntent({
          storeId: payment.storeId,
          amount: Math.round(payment.amount * 100),
          tipAmount: Math.round((payment.tipAmount ?? 0) * 100),
          clientId: payment.clientId,
          appointmentId: payment.appointmentId,
        });
        await capturePaymentIntent(paymentIntentId);
      }
      await removeFromQueue(payment.id);
      refetch();
      qc.invalidateQueries({ queryKey: ['appointments'] });
    } catch (err) {
      Alert.alert('Retry Failed', err instanceof Error ? err.message : 'Could not process payment.');
    } finally {
      setSyncingId(null);
    }
  }, [refetch, qc]);

  function dismissOne(id: string) {
    Alert.alert(
      'Dismiss Payment?',
      'This will remove the queued payment without processing it. The transaction will not be collected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Dismiss',
          style: 'destructive',
          onPress: async () => {
            await removeFromQueue(id);
            refetch();
          },
        },
      ],
    );
  }

  function clearAll() {
    Alert.alert(
      'Clear All Queued Payments?',
      `This will permanently discard all ${queue.length} queued payments. They will NOT be processed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await clearQueue();
            refetch();
          },
        },
      ],
    );
  }

  const pendingCount = queue.filter((p) => p.retries < 5).length;
  const deadCount = queue.filter((p) => p.retries >= 5).length;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={s.title}>Offline Queue</Text>
        {queue.length > 0 && (
          <Pressable onPress={clearAll} style={s.clearBtn}>
            <Text style={s.clearText}>Clear All</Text>
          </Pressable>
        )}
        {queue.length === 0 && <View style={{ width: 60 }} />}
      </View>

      {isLoading ? (
        <View style={s.loader}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : queue.length === 0 ? (
        <View style={s.emptyState}>
          <View style={s.emptyIcon}>
            <Ionicons name="cloud-done-outline" size={52} color={colors.success} />
          </View>
          <Text style={s.emptyTitle}>All caught up</Text>
          <Text style={s.emptySubtitle}>No payments are waiting to sync. Any payments taken offline will appear here automatically.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll}>
          {/* Summary banner */}
          <View style={s.summaryCard}>
            <View style={s.summaryItem}>
              <Text style={s.summaryVal}>{pendingCount}</Text>
              <Text style={s.summaryLabel}>Pending</Text>
            </View>
            <View style={s.summaryDivider} />
            <View style={s.summaryItem}>
              <Text style={[s.summaryVal, deadCount > 0 && { color: colors.danger }]}>{deadCount}</Text>
              <Text style={s.summaryLabel}>Failed</Text>
            </View>
            <View style={s.summaryDivider} />
            <View style={s.summaryItem}>
              <Text style={s.summaryVal}>
                {fmtCurrency(queue.reduce((sum, p) => sum + p.amount, 0))}
              </Text>
              <Text style={s.summaryLabel}>Total</Text>
            </View>
          </View>

          {/* Sync all button */}
          {pendingCount > 0 && (
            <Pressable
              style={[s.syncAllBtn, syncAll.isPending && { opacity: 0.5 }]}
              onPress={() => syncAll.mutate()}
              disabled={syncAll.isPending}
            >
              {syncAll.isPending
                ? <ActivityIndicator color="#fff" size="small" />
                : <Ionicons name="cloud-upload-outline" size={18} color="#fff" />}
              <Text style={s.syncAllText}>
                {syncAll.isPending ? 'Syncing…' : `Sync All ${pendingCount} Payment${pendingCount !== 1 ? 's' : ''}`}
              </Text>
            </Pressable>
          )}

          {/* Queue items */}
          {queue.map((payment) => {
            const isDead = payment.retries >= 5;
            const isSyncing = syncingId === payment.id;
            return (
              <View key={payment.id} style={[s.queueCard, isDead && s.queueCardDead]}>
                <View style={s.queueTop}>
                  <View style={s.queueIconWrap}>
                    <Ionicons name={METHOD_ICONS[payment.method] as any} size={20} color={isDead ? colors.danger : colors.primary} />
                  </View>
                  <View style={s.queueInfo}>
                    <Text style={s.queueClient}>{payment.clientName}</Text>
                    <Text style={s.queueMeta}>
                      {METHOD_LABELS[payment.method]} · {timeAgo(payment.queuedAt)}
                      {payment.retries > 0 && ` · ${payment.retries} retr${payment.retries === 1 ? 'y' : 'ies'}`}
                    </Text>
                  </View>
                  <View style={s.queueAmounts}>
                    <Text style={s.queueAmount}>{fmtCurrency(payment.amount)}</Text>
                    {payment.tipAmount > 0 && (
                      <Text style={s.queueTip}>+{fmtCurrency(payment.tipAmount)} tip</Text>
                    )}
                  </View>
                </View>

                {isDead && (
                  <View style={s.deadBanner}>
                    <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
                    <Text style={s.deadText}>Max retries reached — dismiss or contact support</Text>
                  </View>
                )}

                <View style={s.queueActions}>
                  {!isDead && (
                    <Pressable
                      style={[s.retryBtn, isSyncing && { opacity: 0.4 }]}
                      onPress={() => retryOne(payment)}
                      disabled={!!syncingId || syncAll.isPending}
                    >
                      {isSyncing
                        ? <ActivityIndicator size="small" color={colors.primary} />
                        : <Ionicons name="refresh-outline" size={15} color={colors.primary} />}
                      <Text style={s.retryText}>{isSyncing ? 'Retrying…' : 'Retry'}</Text>
                    </Pressable>
                  )}
                  <Pressable
                    style={s.dismissBtn}
                    onPress={() => dismissOne(payment.id)}
                    disabled={!!syncingId}
                  >
                    <Ionicons name="trash-outline" size={15} color={colors.danger} />
                    <Text style={s.dismissText}>Dismiss</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}

          <Text style={s.helpText}>
            Payments taken while offline are stored securely on this device. They sync automatically when connectivity is restored, or you can retry manually above.
          </Text>

          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.card },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  clearBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  clearText: { color: colors.danger, fontSize: 14, fontWeight: '600' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyIcon: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.successMuted, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  emptySubtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  scroll: { padding: 16, gap: 12 },
  summaryCard: {
    flexDirection: 'row', backgroundColor: colors.card, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  summaryItem: { flex: 1, alignItems: 'center', paddingVertical: 16, gap: 4 },
  summaryVal: { fontSize: 22, fontWeight: '800', color: colors.text },
  summaryLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryDivider: { width: 1, backgroundColor: colors.border, marginVertical: 12 },
  syncAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 15,
  },
  syncAllText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  queueCard: {
    backgroundColor: colors.card, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  queueCardDead: { borderColor: `${colors.danger}50` },
  queueTop: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  queueIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center',
  },
  queueInfo: { flex: 1 },
  queueClient: { fontSize: 15, fontWeight: '700', color: colors.text },
  queueMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  queueAmounts: { alignItems: 'flex-end' },
  queueAmount: { fontSize: 16, fontWeight: '800', color: colors.text },
  queueTip: { fontSize: 12, color: colors.success, fontWeight: '600', marginTop: 2 },
  deadBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.dangerMuted, paddingHorizontal: 14, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: `${colors.danger}30`,
  },
  deadText: { fontSize: 12, color: colors.danger, flex: 1 },
  queueActions: {
    flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border,
  },
  retryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRightWidth: 1, borderRightColor: colors.border,
  },
  retryText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  dismissBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12,
  },
  dismissText: { fontSize: 14, fontWeight: '600', color: colors.danger },
  helpText: {
    fontSize: 12, color: colors.textMuted, textAlign: 'center', lineHeight: 18,
    paddingHorizontal: 8,
  },
});
