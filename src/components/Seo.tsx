import { Helmet } from 'react-helmet-async';

const SITE_URL = 'https://infradarai.com';
const DEFAULT_OG = `${SITE_URL}/og-image.svg`;

export interface SeoProps {
  title: string;
  description: string;
  path: string; // e.g. "/pricing" or "/insights/slug"
  type?: 'website' | 'article';
  image?: string; // absolute URL preferred
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  noindex?: boolean;
}

export function Seo({ title, description, path, type = 'website', image, jsonLd, noindex }: SeoProps) {
  const url = `${SITE_URL}${path}`;
  const ogImage = image
    ? (image.startsWith('http') ? image : `${SITE_URL}${image}`)
    : DEFAULT_OG;
  const ldArray = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      {noindex && <meta name="robots" content="noindex,nofollow" />}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content={type} />
      <meta property="og:image" content={ogImage} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      {ldArray.map((ld, i) => (
        <script key={i} type="application/ld+json">{JSON.stringify(ld)}</script>
      ))}
    </Helmet>
  );
}
