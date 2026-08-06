import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '@/context/AuthContext';
import { fetchStripeConnectStatus } from '@/lib/api';
import { colors } from '@/constants/colors';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:9200';

export default function StripeConnectScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const storeId = user?.storeId ?? 0;

  const { data: status, isLoading, refetch } = useQuery({
    queryKey: ['stripe-connect-status', storeId],
    queryFn: () => fetchStripeConnectStatus(storeId),
    enabled: !!storeId,
    refetchInterval: 10_000,
  });

  async function handleConnect() {
    const url = `${API_BASE}/api/stripe/connect?storeId=${storeId}`;
    const result = await WebBrowser.openAuthSessionAsync(url, 'certxa://stripe-callback');
    if (result.type === 'success') {
      await refetch();
    }
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={s.title}>Stripe Connect</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={s.body}>
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : status?.connected ? (
          <>
            <View style={s.connectedCircle}>
              <Ionicons name="checkmark" size={48} color="#fff" />
            </View>
            <Text style={s.connectedTitle}>Account Connected</Text>
            <Text style={s.connectedSub}>Payments will deposit to your linked Stripe account.</Text>

            <View style={s.statusCard}>
              {[
                { label: 'Charges Enabled', ok: status.chargesEnabled },
                { label: 'Payouts Enabled', ok: status.payoutsEnabled },
                { label: 'Account ID', ok: true, val: status.accountId ?? '' },
              ].map((row) => (
                <View key={row.label} style={s.statusRow}>
                  <Text style={s.statusLabel}>{row.label}</Text>
                  {row.val ? (
                    <Text style={s.statusVal}>{row.val}</Text>
                  ) : (
                    <Ionicons
                      name={row.ok ? 'checkmark-circle' : 'close-circle'}
                      size={20}
                      color={row.ok ? colors.success : colors.danger}
                    />
                  )}
                </View>
              ))}
            </View>

            <Pressable
              style={s.disconnectBtn}
              onPress={() => Alert.alert('Disconnect', 'Contact support to disconnect your Stripe account.')}
            >
              <Text style={s.disconnectText}>Contact Support to Disconnect</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={s.stripeLogoCircle}>
              <Ionicons name="flash-outline" size={40} color={colors.primary} />
            </View>
            <Text style={s.connectTitle}>Connect Your Stripe Account</Text>
            <Text style={s.connectSub}>
              Link your Stripe account so card payments go directly to you. Certxa deducts a small platform fee automatically.
            </Text>

            <View style={s.featureList}>
              {[
                'Payments land in your bank account',
                'Instant payouts available',
                'Full Stripe dashboard access',
                'Platform fee auto-deducted per transaction',
              ].map((f) => (
                <View key={f} style={s.featureRow}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                  <Text style={s.featureText}>{f}</Text>
                </View>
              ))}
            </View>

            <Pressable style={s.connectBtn} onPress={handleConnect}>
              <Ionicons name="flash" size={18} color="#fff" />
              <Text style={s.connectBtnText}>Connect with Stripe</Text>
            </Pressable>
            <Text style={s.disclaimer}>
              You'll be redirected to Stripe to sign in or create an account.
            </Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.card },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  body: { flex: 1, alignItems: 'center', padding: 32, gap: 16 },
  connectedCircle: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  connectedTitle: { fontSize: 24, fontWeight: '800', color: colors.text },
  connectedSub: { fontSize: 15, color: colors.textSecondary, textAlign: 'center' },
  statusCard: { width: '100%', backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusLabel: { fontSize: 14, color: colors.textSecondary },
  statusVal: { fontSize: 12, color: colors.textMuted, fontFamily: 'monospace' },
  disconnectBtn: { paddingVertical: 12, paddingHorizontal: 20 },
  disconnectText: { color: colors.textMuted, fontSize: 14 },
  stripeLogoCircle: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  connectTitle: { fontSize: 24, fontWeight: '800', color: colors.text, textAlign: 'center' },
  connectSub: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  featureList: { width: '100%', gap: 10 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureText: { fontSize: 14, color: colors.text },
  connectBtn: { width: '100%', backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 },
  connectBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disclaimer: { fontSize: 12, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },
});
