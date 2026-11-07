// @ts-check
import cloudflare from '@astrojs/cloudflare';
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';
import starlightLinksValidator from 'starlight-links-validator';

const GITHUB_REPO = 'https://github.com/azhukaudev/convex-angular';
const SITE = 'https://convex-angular.azhukau.com';
const DESCRIPTION =
  'The Angular client for Convex. Signals, dependency injection, authentication, pagination, and server-side rendering.';

export default defineConfig({
  // Origin only, no `base`: the site deploys at the root, matching the root-absolute links in the content.
  site: SITE,
  integrations: [
    starlight({
      title: 'convex-angular',
      description: DESCRIPTION,
      // Starlight already emits the title, description, canonical and favicon tags; these add the link-preview
      // card (public/og.png, source in branding/og.html), the iOS home-screen icon and structured data for search.
      head: [
        { tag: 'meta', attrs: { property: 'og:image', content: `${SITE}/og.png` } },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
        { tag: 'meta', attrs: { property: 'og:image:alt', content: 'convex-angular: the Angular client for Convex' } },
        { tag: 'meta', attrs: { name: 'twitter:image', content: `${SITE}/og.png` } },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' } },
        {
          tag: 'script',
          attrs: { type: 'application/ld+json' },
          content: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareSourceCode',
            name: 'convex-angular',
            description: DESCRIPTION,
            url: SITE,
            codeRepository: GITHUB_REPO,
            programmingLanguage: 'TypeScript',
            runtimePlatform: 'Angular',
            license: 'https://opensource.org/licenses/MIT',
          }),
        },
        // Cloudflare Web Analytics; the token is a public site ID, not a secret.
        {
          tag: 'script',
          attrs: {
            type: 'module',
            src: 'https://static.cloudflareinsights.com/beacon.min.js',
            'data-cf-beacon': JSON.stringify({ token: '1d6ac246506640d2817cda74236a5695' }),
          },
        },
      ],
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
  // Deployed to Cloudflare Workers (see wrangler.jsonc). Every page is prerendered, and in Node: in workerd (the
  // adapter's default) Astro's Markdown pipeline resolves a WASI build of satteri that is not installed.
  // `allowBuilds` denies sharp's native install script, so keep Astro off its sharp-backed image pipeline and off
  // the adapter's Cloudflare Images binding.
  adapter: cloudflare({ prerenderEnvironment: 'node', imageService: 'passthrough' }),
  // Every page is static, so nothing uses sessions; without this the adapter adds a `SESSION` KV binding that
  // the first deploy would provision.
  session: false,
});
