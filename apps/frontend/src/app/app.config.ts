import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import Aura from '@primeuix/themes/aura';
import { CONVEX_AUTH_GUARD_CONFIG, provideConvex, provideConvexAuthFromExisting } from 'convex-angular';
import { providePrimeNG } from 'primeng/config';

import { environment } from '../environments/environment';
import { appRoutes } from './app.routes';
import { DemoAuthService } from './auth/demo-auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(appRoutes),
    provideConvex(environment.convexUrl),
    DemoAuthService,
    provideConvexAuthFromExisting(DemoAuthService),
    {
      provide: CONVEX_AUTH_GUARD_CONFIG,
      useValue: {
        loginRoute: '/auth/login',
      },
    },
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
  ],
};
