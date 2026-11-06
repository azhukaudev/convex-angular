// @ts-check
import starlight from '@astrojs/starlight';
import vercel from '@astrojs/vercel';
import { defineConfig, passthroughImageService } from 'astro/config';
import starlightLinksValidator from 'starlight-links-validator';

const GITHUB_REPO = 'https://github.com/azhukaudev/convex-angular';

export default defineConfig({
  // Origin only, no `base`: the site deploys at the root, matching the root-absolute links in the content.
  site: 'https://convex-angular.vercel.app',
  // `allowBuilds` denies sharp's native install script, so keep Astro off its
  // optional sharp-backed image pipeline.
  image: { service: passthroughImageService() },
  integrations: [
    starlight({
      title: 'convex-angular',
      description:
        'The Angular client for Convex. Signals, dependency injection, authentication, pagination, and server-side rendering.',
      social: [{ icon: 'github', label: 'GitHub', href: GITHUB_REPO }],
      editLink: { baseUrl: `${GITHUB_REPO}/edit/main/apps/docs/` },
      lastUpdated: true,
      customCss: ['./src/styles/custom.css'],
      // Starlight only validates the slugs named in `sidebar`; this extends the
      // check to cross-links inside page content.
      plugins: [starlightLinksValidator({ errorOnRelativeLinks: false })],
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'Introduction', slug: 'start/introduction' },
            { label: 'Installation', slug: 'start/installation' },
            { label: 'Quick start', slug: 'start/quick-start' },
          ],
        },
        {
          label: 'Core concepts',
          items: [{ autogenerate: { directory: 'concepts' } }],
        },
        {
          label: 'Queries',
          items: [{ autogenerate: { directory: 'queries' } }],
        },
        {
          label: 'Mutations & actions',
          items: [{ autogenerate: { directory: 'mutations' } }],
        },
        {
          label: 'Authentication',
          items: [{ autogenerate: { directory: 'auth' } }],
        },
        {
          label: 'Server-side rendering',
          items: [{ autogenerate: { directory: 'ssr' } }],
        },
        {
          label: 'Testing',
          items: [{ autogenerate: { directory: 'testing' } }],
        },
        {
          label: 'API reference',
          items: [{ autogenerate: { directory: 'reference' } }],
        },
      ],
    }),
  ],
  adapter: vercel({
    webAnalytics: {
      enabled: true,
    },
  }),
});
