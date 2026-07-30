/**
 * In-app purchase layer for ParkFree Premium.
 *
 * Production path: RevenueCat (react-native-purchases). To go live:
 *   1. npx expo install react-native-purchases
 *   2. Create a RevenueCat project, add the App Store app, create an
 *      entitlement called "premium" attached to your products
 *      (suggested: parkfree_premium_yearly, parkfree_premium_lifetime).
 *   3. Put your public Apple API key below (REVENUECAT_APPLE_KEY).
 *   4. Rebuild with EAS. The runtime check below picks it up automatically.
 *
 * Until then (Expo Go, web preview, simulators) a local mock is used so the
 * whole premium flow is testable end to end.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const REVENUECAT_APPLE_KEY = ''; // <- your RevenueCat public Apple API key

export interface PremiumPackage {
  identifier: string;
  title: string;
  priceString: string;
  period: 'yearly' | 'lifetime' | 'monthly';
}

export interface PurchasesAPI {
  isReady(): boolean;
  getPremiumStatus(): Promise<boolean>;
  getPackages(): Promise<PremiumPackage[]>;
  purchase(pkgId: string): Promise<boolean>;
  restore(): Promise<boolean>;
}

const MOCK_KEY = 'parkfree.premium.mock';

/** Local mock — used whenever RevenueCat isn't configured/available. */
const mockAPI: PurchasesAPI = {
  isReady: () => true,
  async getPremiumStatus() {
    return (await AsyncStorage.getItem(MOCK_KEY)) === 'true';
  },
  async getPackages() {
    return [
      { identifier: 'parkfree_premium_yearly', title: 'Yearly', priceString: 'A$29.99/yr', period: 'yearly' },
      { identifier: 'parkfree_premium_lifetime', title: 'Lifetime', priceString: 'A$59.99', period: 'lifetime' },
    ];
  },
  async purchase() {
    await AsyncStorage.setItem(MOCK_KEY, 'true');
    return true;
  },
  async restore() {
    return (await AsyncStorage.getItem(MOCK_KEY)) === 'true';
  },
};

function buildRevenueCatAPI(): PurchasesAPI | null {
  if (!REVENUECAT_APPLE_KEY) return null;
  let Purchases: any;
  try {
    // Optional dependency — present only after `npx expo install react-native-purchases`.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Purchases = require('react-native-purchases').default;
  } catch {
    return null;
  }
  let configured = false;
  const ensure = async () => {
    if (!configured) {
      await Purchases.configure({ apiKey: REVENUECAT_APPLE_KEY });
      configured = true;
    }
  };
  return {
    isReady: () => true,
    async getPremiumStatus() {
      await ensure();
      const info = await Purchases.getCustomerInfo();
      return !!info.entitlements.active['premium'];
    },
    async getPackages() {
      await ensure();
      const offerings = await Purchases.getOfferings();
      const pkgs = offerings.current?.availablePackages ?? [];
      return pkgs.map((p: any) => ({
        identifier: p.identifier,
        title: p.product.title,
        priceString: p.product.priceString,
        period: p.packageType === 'LIFETIME' ? 'lifetime' : p.packageType === 'ANNUAL' ? 'yearly' : 'monthly',
      }));
    },
    async purchase(pkgId: string) {
      await ensure();
      const offerings = await Purchases.getOfferings();
      const pkg = offerings.current?.availablePackages.find((p: any) => p.identifier === pkgId);
      if (!pkg) return false;
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      return !!customerInfo.entitlements.active['premium'];
    },
    async restore() {
      await ensure();
      const info = await Purchases.restorePurchases();
      return !!info.entitlements.active['premium'];
    },
  };
}

const revenueCat = buildRevenueCatAPI();
export const purchases: PurchasesAPI = revenueCat ?? mockAPI;
export const usingMockPurchases = !revenueCat;
