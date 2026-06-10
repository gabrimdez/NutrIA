import React from 'react';
import { hidePremiumLock, usePremiumLockState } from '../lib/premiumLock';
import { PremiumLockModal } from './PremiumLockModal';

/** Host único montado en el layout raíz para mostrar el PremiumLockModal global. */
export function PremiumLockHost() {
  const { visible, options } = usePremiumLockState();

  return (
    <PremiumLockModal
      visible={visible}
      onDismiss={() => {
        hidePremiumLock();
        options.onDismiss?.();
      }}
      featureName={options.featureName}
      title={options.title}
      message={options.message}
      perks={options.perks}
      ctaLabel={options.ctaLabel}
      dismissLabel={options.dismissLabel}
      onUpgrade={
        options.onUpgrade
          ? () => {
              hidePremiumLock();
              options.onUpgrade?.();
            }
          : undefined
      }
    />
  );
}
