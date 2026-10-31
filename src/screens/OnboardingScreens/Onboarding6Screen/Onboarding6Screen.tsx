import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {Animated, Easing, View} from 'react-native';
import {observer} from 'mobx-react';
import {when} from 'mobx';
import {ProgressBar, Text} from 'react-native-paper';

import {modelStore, uiStore} from '../../../store';
import {useTheme} from '../../../hooks';
import {L10nContext} from '../../../utils';
import {resolvePalForTopic} from '../../../store/onboarding/onboardingPals';
import {OnboardingScaffold} from '../components/OnboardingScaffold';
import {OnboardingContent} from '../components/OnboardingContent';
import {ItalicAccentTitle} from '../components/ItalicAccentTitle';
import {PipMascot} from '../illustrations/PipMascot';
import {DownloadErrorDialog} from '../../../components/DownloadErrorDialog';
import {createStyles} from './styles';

// Keeps the "ready" state on screen briefly so the transition into chat
// never feels like a flash, even when the model was already on disk
// (replayed onboarding) and the whole run resolves near-instantly.
const MIN_DWELL_MS = 700;

type Phase = 'preparing' | 'downloading' | 'activating' | 'ready' | 'error';

// There is no topic picker — this always resolves to the `else` tier
// list (general-purpose models), independent of any named persona. No
// Pal is ever created from it: the model is bound directly.
const RECOMMENDED_MODELS = resolvePalForTopic(null).models;

/**
 * The only onboarding screen — no picker, no chrome, no skip button.
 * Auto-registers the recommended model, downloads it, loads it into
 * memory (`selectModel`) so chat is actually ready — not just
 * downloaded — then completes onboarding straight into chat. Blocks
 * here the whole time: `DownloadOverlay` stays hidden while onboarding
 * is in progress (see App.tsx) so this screen is the only download
 * indicator the user sees.
 */
export const Onboarding6Screen: React.FC = observer(() => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const l10n = useContext(L10nContext);
  const t = l10n.onboarding;

  const [phase, setPhase] = useState<Phase>('preparing');
  const startedRef = useRef(false);
  const pickedIdRef = useRef<string | undefined>(undefined);

  const pulse = useRef(new Animated.Value(0.94)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.06,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.94,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const run = useCallback(async () => {
    setPhase('preparing');
    const entry =
      RECOMMENDED_MODELS.find(m => m.recommended) ?? RECOMMENDED_MODELS[0];
    if (!entry) {
      uiStore.completeOnboarding({topic: null, modelId: null});
      return;
    }
    try {
      const picked = await modelStore.registerOnboardingPalModel(entry);
      pickedIdRef.current = picked?.id;
      if (!picked) {
        throw new Error('model registration failed');
      }
      if (!picked.isDownloaded) {
        setPhase('downloading');
        // Resolves once the native download is *queued*, not once the file
        // is on disk (Android's DownloadManager-style API returns a job id
        // immediately; iOS behaves the same way here). The real signal is
        // `model.isDownloaded` flipping via DownloadManager's onComplete
        // callback, so wait for that (or a download error) before leaving
        // this screen — otherwise onboarding completes mid-download.
        await modelStore.checkSpaceAndDownload(picked.id);
        await when(
          () =>
            !!modelStore.models.find(m => m.id === picked.id)?.isDownloaded ||
            modelStore.downloadError?.metadata?.modelId === picked.id,
        );
        if (modelStore.downloadError?.metadata?.modelId === picked.id) {
          throw new Error('model download failed');
        }
      }
      // Downloaded is not the same as ready to chat — load it into memory
      // now so the user never has to tap "Load model" themselves.
      setPhase('activating');
      await modelStore.selectModel(picked);
      setPhase('ready');
      setTimeout(() => {
        uiStore.completeOnboarding({topic: null, modelId: picked.id});
      }, MIN_DWELL_MS);
    } catch {
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;
    run();
  }, [run]);

  const retry = useCallback(() => {
    modelStore.clearDownloadError();
    run();
  }, [run]);

  const dismissToChat = useCallback(() => {
    modelStore.clearDownloadError();
    uiStore.completeOnboarding({topic: null, modelId: null});
  }, []);

  const downloadingModel = pickedIdRef.current
    ? modelStore.models.find(m => m.id === pickedIdRef.current)
    : undefined;
  const progress = downloadingModel?.progress ?? 0;

  const statusText =
    phase === 'downloading'
      ? t.screen6.downloadingStatus.replace(
          '{{progress}}',
          String(Math.round(progress)),
        )
      : phase === 'activating'
        ? t.screen6.activatingStatus
        : phase === 'ready'
          ? t.screen6.readyStatus
          : t.screen6.preparingStatus;

  return (
    <>
      <OnboardingScaffold
        step={6}
        layout="centered"
        illustration={
          <Animated.View style={{transform: [{scale: pulse}]}}>
            <PipMascot width={88} />
          </Animated.View>
        }
        content={
          <OnboardingContent
            title={
              <ItalicAccentTitle
                title={t.screen6.loadingTitle}
                align="center"
              />
            }
            body={
              <View style={styles.statusWrap}>
                <Text style={styles.status}>{statusText}</Text>
                {phase === 'downloading' && (
                  <ProgressBar
                    testID="onboarding-download-progress"
                    progress={progress / 100}
                    color={theme.colors.tertiary}
                    style={styles.progressBar}
                  />
                )}
              </View>
            }
          />
        }
      />
      <DownloadErrorDialog
        visible={phase === 'error'}
        onDismiss={dismissToChat}
        error={modelStore.downloadError}
        model={downloadingModel}
        onTryAgain={retry}
      />
    </>
  );
});
