import { Platform } from 'react-native';
import Constants from 'expo-constants';

let RewardedAd: any = null;
let RewardedAdEventType: any = null;
let AdEventType: any = null;
let TestIds: any = null;
const isExpoGo = Constants.appOwnership === 'expo';

if (!isExpoGo) {
  try {
    const ads = require('react-native-google-mobile-ads');
    RewardedAd = ads.RewardedAd;
    RewardedAdEventType = ads.RewardedAdEventType;
    AdEventType = ads.AdEventType;
    TestIds = ads.TestIds;
  } catch {}
}

const REWARDED_AD_UNIT = __DEV__ && TestIds
  ? TestIds.REWARDED
  : Platform.select({
      ios: 'ca-app-pub-3965931075265436/6514522207',
      android: 'ca-app-pub-3965931075265436/9950889702',
    }) ?? '';

let rewardedAd: any = null;
let isAdLoaded = false;
let loadListeners: (() => void)[] = [];

const MAX_LOAD_RETRY = 3;
const LOAD_RETRY_INTERVAL_MS = 5000;
let loadRetryCount = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

const SHOW_WAIT_LOAD_MS = 5000;

/**
 * リワード広告をプリロードする。ゲーム開始時に呼ぶ。
 * ロード失敗時は最大 MAX_LOAD_RETRY 回、LOAD_RETRY_INTERVAL_MS 間隔で自動リトライ。
 */
export function preloadRewardedAd(): void {
  if (!RewardedAd || isExpoGo || !REWARDED_AD_UNIT) return;

  try {
    rewardedAd = RewardedAd.createForAdRequest(REWARDED_AD_UNIT, {
      requestNonPersonalizedAdsOnly: true,
    });

    isAdLoaded = false;
    loadRetryCount = 0;
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }

    rewardedAd.addAdEventListener(RewardedAdEventType.LOADED, () => {
      isAdLoaded = true;
      loadRetryCount = 0;
      loadListeners.forEach(fn => fn());
      loadListeners = [];
    });

    rewardedAd.addAdEventListener(AdEventType.ERROR, (error: any) => {
      console.warn('[RewardedAd] Load error:', error);
      isAdLoaded = false;
      if (loadRetryCount < MAX_LOAD_RETRY) {
        loadRetryCount++;
        console.log(`[RewardedAd] Retry ${loadRetryCount}/${MAX_LOAD_RETRY} in ${LOAD_RETRY_INTERVAL_MS}ms`);
        retryTimer = setTimeout(() => {
          retryTimer = null;
          try { rewardedAd && rewardedAd.load(); } catch (e) {
            console.warn('[RewardedAd] Retry load failed:', e);
          }
        }, LOAD_RETRY_INTERVAL_MS);
      } else {
        console.warn('[RewardedAd] Max retries reached. Will fallback on next show request.');
      }
    });

    rewardedAd.load();
  } catch (e) {
    console.warn('[RewardedAd] Failed to create ad:', e);
  }
}

export function isRewardedAdReady(): boolean {
  return isAdLoaded && rewardedAd != null;
}

function waitForLoad(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (isAdLoaded) return resolve(true);
    const timer = setTimeout(() => {
      resolve(false);
    }, timeoutMs);
    loadListeners.push(() => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

/**
 * リワード広告を表示し、視聴完了を待つ。
 * 未ロード時は短時間だけ再取得を試み、それでも失敗なら報酬を付与する（ユーザー救済）。
 * 完了時は true を返す。キャンセル/エラー時は false。
 */
export async function showRewardedAd(): Promise<boolean> {
  if (!rewardedAd || !isAdLoaded) {
    if (!rewardedAd) {
      preloadRewardedAd();
    } else if (!isAdLoaded) {
      try { rewardedAd.load(); } catch (e) {
        console.warn('[RewardedAd] show-time retry load failed:', e);
      }
    }
    const loaded = await waitForLoad(SHOW_WAIT_LOAD_MS);
    if (!loaded) {
      console.warn('[RewardedAd] Show-time load timeout — granting reward (fallback)');
      preloadRewardedAd();
      return true;
    }
  }

  return new Promise((resolve) => {
    let rewarded = false;
    let settled = false;

    const settle = (result: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      isAdLoaded = false;
      preloadRewardedAd();
      resolve(result);
    };

    const timer = setTimeout(() => {
      console.warn('[RewardedAd] Timeout after 15s — granting reward');
      settle(true);
    }, 15000);

    const earnedSub = rewardedAd.addAdEventListener(
      RewardedAdEventType.EARNED_REWARD,
      () => { rewarded = true; }
    );

    const closedSub = rewardedAd.addAdEventListener(
      AdEventType.CLOSED,
      () => {
        earnedSub();
        closedSub();
        settle(rewarded);
      }
    );

    try {
      rewardedAd.show();
    } catch (e) {
      console.warn('[RewardedAd] show() failed:', e);
      earnedSub();
      closedSub();
      settle(true);
    }
  });
}
