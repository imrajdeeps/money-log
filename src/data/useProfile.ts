import { useSyncExternalStore } from 'react';
import { loadProfile, subscribeProfile } from './profile.ts';
import type { Profile } from '../core/profile.ts';

// The profile, kept up to date wherever it is shown.
export const useProfile = (): Profile => useSyncExternalStore(subscribeProfile, loadProfile);
