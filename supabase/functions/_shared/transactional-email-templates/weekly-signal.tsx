/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Hr,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'InfradarAI'
const SITE_URL = 'https://infradarai.com'
const PRIMARY = 'hsl(170, 55%, 63%)'
const FOREGROUND = '#0d1114'
const MUTED = '#55636a'

interface SignalProject {
  name: string
  country: string
  region?: string
  sector?: string
  stage?: string
  value_label?: string
  confidence?: number
  source_url?: string
  why?: string
}

interface WeeklySignalProps {
  name?: string
  intro?: string
  projects?: SignalProject[]
  ctaUrl?: string
}

/**
 * "Weekly Infrastructure Signal" — the inbound flywheel. 3 curated, real,
 * source-linked projects from the live index → signup CTA. Near-zero marginal
 * cost because the content is generated from data we already hold.
 */
const WeeklySignalEmail = ({ name, intro, projects = [], ctaUrl }: WeeklySignalProps) => {
  const greeting = name ? `Hi ${name},` : 'Hi,'
  const cta = ctaUrl || `${SITE_URL}/?utm_source=weekly_signal&utm_medium=email&utm_campaign=newsletter`
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>3 infrastructure projects worth watching this week</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={brandBar}>
            <Text style={brandText}>{SITE_NAME} &middot; WEEKLY INFRASTRUCTURE SIGNAL</Text>
          </Section>

          <Heading style={h1}>{greeting}</Heading>
          <Text style={text}>
            {intro ||
              'Three verified infrastructure projects from this week’s index that most investors and contractors are not yet tracking. Every project links back to its source.'}
          </Text>

          {projects.slice(0, 3).map((p, i) => (
            <Section key={i} style={card}>
              <Text style={cardTitle}>{p.name}</Text>
              <Text style={cardMeta}>
                {[p.country, p.sector, p.stage, p.value_label]
                  .filter(Boolean)
                  .join('  ·  ')}
                {typeof p.confidence === 'number' ? `  ·  ${p.confidence}% confidence` : ''}
              </Text>
              {p.why ? <Text style={cardWhy}>{p.why}</Text> : null}
              {p.source_url ? (
                <Text style={cardSource}>
                  <Link href={p.source_url} style={link}>View source</Link>
                </Text>
              ) : null}
            </Section>
          ))}

          <Section style={{ textAlign: 'center' as const, margin: '28px 0' }}>
            <Button href={cta} style={btn}>See the full live index</Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            {SITE_NAME} &middot;{' '}
            <a href={SITE_URL} style={link}>infradarai.com</a>
            {' '}&middot;{' '}
            <a href={`${SITE_URL}/unsubscribe`} style={link}>Unsubscribe</a>
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: WeeklySignalEmail,
  subject: 'Weekly Infrastructure Signal — 3 projects worth watching',
  displayName: 'Weekly Infrastructure Signal',
  previewData: {
    name: 'Jane',
    projects: [
      {
        name: 'Lekki Deep Sea Port Expansion',
        country: 'Nigeria',
        sector: 'Ports',
        stage: 'Planned',
        value_label: '$1.5B',
        confidence: 78,
        source_url: 'https://example.org/project',
        why: 'Early-stage, pre-tender — 12+ months before it reaches public RFP.',
      },
    ],
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
}
const container = { padding: '24px 28px', maxWidth: '560px' }
const brandBar = { paddingBottom: '16px', borderBottom: `2px solid ${PRIMARY}` }
const brandText = {
  margin: 0, fontSize: '12px', fontWeight: 700, letterSpacing: '0.16em',
  color: FOREGROUND, fontFamily: "'Playfair Display', Georgia, serif",
}
const h1 = {
  fontSize: '20px', fontWeight: 700, color: FOREGROUND,
  margin: '24px 0 12px', fontFamily: "'Playfair Display', Georgia, serif",
}
const text = { fontSize: '15px', color: MUTED, lineHeight: '1.6', margin: '0 0 18px' }
const card = { padding: '14px 16px', margin: '0 0 14px', border: '1px solid #e6e8ea', borderRadius: '8px' }
const cardTitle = { margin: '0 0 4px', fontSize: '15px', fontWeight: 700, color: FOREGROUND }
const cardMeta = { margin: '0 0 6px', fontSize: '13px', color: MUTED }
const cardWhy = { margin: '0 0 6px', fontSize: '14px', color: FOREGROUND, lineHeight: '1.5' }
const cardSource = { margin: 0, fontSize: '13px' }
const btn = {
  backgroundColor: PRIMARY, color: FOREGROUND, borderRadius: '6px',
  padding: '12px 24px', fontSize: '14px', fontWeight: 600, textDecoration: 'none',
  display: 'inline-block',
}
const hr = { borderColor: '#e6e8ea', margin: '24px 0 0' }
const footer = { fontSize: '12px', color: MUTED, margin: '16px 0 0', lineHeight: '1.5' }
const link = { color: PRIMARY, textDecoration: 'none' }
