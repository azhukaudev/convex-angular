import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import Aura from '@primeuix/themes/aura';
import {
  CONVEX_AUTH,
  CONVEX_AUTH_GUARD_CONFIG,
  provideConvex,
  provideConvexAuth,
} from 'convex-angular';
import { providePrimeNG } from 'primeng/config';

import { environment } from '../environments/environment';
import { appRoutes } from './app.routes';
import { MockAuthService } from './auth/mock-auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(appRoutes),
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: '.dark',
          cssLayer: {
            name: 'primeng',
            order: 'theme, base, primeng',
          },
        },
      },
    }),
    provideConvex(environment.convexUrl),
    // Auth integration with mock provider
    {
      provide: CONVEX_AUTH_GUARD_CONFIG,
      useValue: {
        loginRoute: '/auth/login',
      },
    },
    { provide: CONVEX_AUTH, useExisting: MockAuthService },
    provideConvexAuth(),
  ],
};
