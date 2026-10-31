import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';

import {ROUTES} from '../../utils/navigationConstants';
import {SplashScreen} from './SplashScreen';
import {Onboarding6Screen} from './Onboarding6Screen';

const Stack = createStackNavigator();

/**
 * Onboarding navigator — splash, then straight into the single
 * full-screen auto-setup screen. No chrome, no skip button, no
 * marketing carousel or topic/pal picker.
 */
export const OnboardingStack: React.FC = () => (
  <Stack.Navigator
    screenOptions={{headerShown: false, gestureEnabled: false}}
    initialRouteName={ROUTES.ONBOARDING.SPLASH}>
    <Stack.Screen name={ROUTES.ONBOARDING.SPLASH} component={SplashScreen} />
    <Stack.Screen
      name={ROUTES.ONBOARDING.STEP_6}
      component={Onboarding6Screen}
    />
  </Stack.Navigator>
);
