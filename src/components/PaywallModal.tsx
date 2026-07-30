import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Modal, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { colors } from '../theme';
import { useStore } from '../state/store';
import { purchases, usingMockPurchases, type PremiumPackage } from '../purchases';

const FEATURES = [
  ['✨', 'Free NOW filter', 'Instantly see every street that is free at this exact moment.'],
  ['⏱', 'Parking timer', 'Set it when you park — get an alert before your time runs out.'],
  ['🗺', 'All Sydney coverage', 'Eastern suburbs, Inner West and North Shore street data.'],
  ['📶', 'Offline maps data', 'Street rules bundled on-device — works in underground car parks.'],
] as const;

export function PaywallModal() {
  const visible = useStore((s) => s.paywallVisible);
  const showPaywall = useStore((s) => s.showPaywall);
  const setPremium = useStore((s) => s.setPremium);

  const [packages, setPackages] = useState<PremiumPackage[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    purchases.getPackages().then((pkgs) => {
      setPackages(pkgs);
      setSelected(pkgs[0]?.identifier ?? null);
    });
  }, [visible]);

  const buy = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await purchases.purchase(selected);
      if (ok) {
        setPremium(true);
        showPaywall(false);
      } else {
        setError('Purchase did not complete.');
      }
    } catch (e: any) {
      if (!e?.userCancelled) setError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    try {
      const ok = await purchases.restore();
      if (ok) {
        setPremium(true);
        showPaywall(false);
      } else {
        setError('No previous purchase found.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => showPaywall(false)}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Pressable onPress={() => showPaywall(false)} style={styles.close} hitSlop={12}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>

          <Text style={styles.kicker}>PARKFREE PREMIUM</Text>
          <Text style={styles.title}>Never pay for parking again</Text>

          <View style={styles.features}>
            {FEATURES.map(([icon, title, desc]) => (
              <View key={title} style={styles.feature}>
                <Text style={styles.featureIcon}>{icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureTitle}>{title}</Text>
                  <Text style={styles.featureDesc}>{desc}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.packages}>
            {packages.map((p) => {
              const active = selected === p.identifier;
              return (
                <Pressable
                  key={p.identifier}
                  onPress={() => setSelected(p.identifier)}
                  style={[styles.pkg, active && styles.pkgActive]}
                >
                  <Text style={[styles.pkgTitle, active && { color: colors.text }]}>{p.title}</Text>
                  <Text style={[styles.pkgPrice, active && { color: colors.accent }]}>{p.priceString}</Text>
                  {p.period === 'yearly' && <Text style={styles.pkgTag}>BEST VALUE</Text>}
                </Pressable>
              );
            })}
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable style={styles.cta} onPress={buy} disabled={busy}>
            {busy ? (
              <ActivityIndicator color="#04291B" />
            ) : (
              <Text style={styles.ctaText}>Unlock Premium</Text>
            )}
          </Pressable>

          <Pressable onPress={restore} disabled={busy}>
            <Text style={styles.restore}>Restore purchase</Text>
          </Pressable>

          {usingMockPurchases && (
            <Text style={styles.devNote}>
              Dev build: purchases are simulated. Wire RevenueCat in src/purchases before release.
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  card: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: colors.border,
  },
  close: {
    position: 'absolute', top: 16, right: 16, zIndex: 2,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center', justifyContent: 'center',
  },
  closeText: { color: colors.textDim, fontSize: 14, fontWeight: '600' },
  kicker: { color: colors.premium, fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', marginTop: 6, marginBottom: 18 },
  features: { gap: 14, marginBottom: 22 },
  feature: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  featureIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  featureTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  featureDesc: { color: colors.textDim, fontSize: 13, lineHeight: 18, marginTop: 1 },
  packages: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  pkg: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 14,
  },
  pkgActive: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised },
  pkgTitle: { color: colors.textDim, fontSize: 13, fontWeight: '700' },
  pkgPrice: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 4 },
  pkgTag: {
    color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginTop: 6,
  },
  error: { color: colors.danger, fontSize: 13, marginBottom: 10, textAlign: 'center' },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaText: { color: '#04291B', fontSize: 17, fontWeight: '800' },
  restore: { color: colors.textDim, fontSize: 13, textAlign: 'center', marginTop: 14 },
  devNote: { color: colors.warning, fontSize: 11, textAlign: 'center', marginTop: 12 },
});
