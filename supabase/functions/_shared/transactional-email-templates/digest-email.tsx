/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'InfradarAI'
const SITE_URL = 'https://infradarai.com'
const DASHBOARD_URL = `${SITE_URL}/dashboard`
const PRIMARY = 'hsl(170, 55%, 63%)'
const FOREGROUND = '#0d1114'
const MUTED = '#55636a'
const LIGHT_BG = '#f5f7f8'

interface DigestSection {
  title: string
  bullets: string[]
}

interface DigestEmailProps {
  title?: string
  summary?: string
  sections?: DigestSection[]
  citations?: Array<{ label: string; url: string }>
  ruleName?: string
}

const DigestEmail = ({
  title = 'Your InfradarAI Intelligence Digest',
  summary = 'Your latest infrastructure intelligence summary is ready.',
  sections = [],
  citations = [],
  ruleName,
}: DigestEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{summary}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={brandBar}>
          <Text style={brandText}>{SITE_NAME}</Text>
        </Section>

        <Heading style={h1}>{title}</Heading>

        {ruleName && (
          <Text style={ruleTag}>Alert rule: {ruleName}</Text>
        )}

        <Text style={summaryText}>{summary}</Text>

        {sections.map((section, i) => (
          <Section key={i} style={sectionBox}>
            <Text style={sectionTitle}>{section.title}</Text>
            {section.bullets.map((bullet, j) => (
              <Text key={j} style={bulletText}>
                {'· '}{bullet}
              </Text>
            ))}
          </Section>
        ))}

        {citations.length > 0 && (
          <>
            <Hr style={divider} />
            <Text style={citationsLabel}>Sources</Text>
            {citations.map((c, i) => (
              <Text key={i} style={citationItem}>
                <a href={c.url} style={link}>{c.label}</a>
              </Text>
            ))}
          </>
        )}

        <Hr style={divider} />

        <Section style={ctaSection}>
          <Button href={DASHBOARD_URL} style={ctaButton}>
            Open Dashboard
          </Button>
        </Section>

        <Text style={footer}>
          {SITE_NAME} &middot;{' '}
          <a href={SITE_URL} style={link}>infradarai.com</a>
          {' '}&middot;{' '}
          <a href={`${SITE_URL}/dashboard/settings`} style={link}>Manage email preferences</a>
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: DigestEmail,
  subject: (data: Record<string, any>) =>
    typeof data.title === 'string' && data.title ? data.title : 'Your InfradarAI Intelligence Digest',
  displayName: 'Intelligence digest email',
  previewData: {
    title: 'Weekly Market Digest - MENA Infrastructure',
    summary: 'Three major project updates this week across energy and transport sectors.',
    ruleName: 'MENA Energy Weekly',
    sections: [
      {
        title: 'Project Updates',
        bullets: [
          'Red Sea Wind Farm (Saudi Arabia) advanced to Financing stage with $2.1B commitment from ACWA Power.',
          'Cairo Metro Line 4 tender awarded to a French-Egyptian consortium after 18-month delay.',
        ],
      },
      {
        title: 'Market Intelligence',
        bullets: [
          'AfDB approved $450M for renewable energy projects across West Africa.',
          'IFC announced a new infrastructure fund targeting East African logistics corridors.',
        ],
      },
    ],
    citations: [
      { label: 'AfDB Press Release', url: 'https://afdb.org' },
      { label: 'IFC Infrastructure', url: 'https://ifc.org' },
    ],
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
}
const container = { padding: '24px 28px', maxWidth: '600px' }
const brandBar = { paddingBottom: '16px', borderBottom: `2px solid ${PRIMARY}` }
const brandText = {
  margin: 0,
  fontSize: '14px',
  fontWeight: 700,
  letterSpacing: '0.18em',
  color: FOREGROUND,
  fontFamily: "'Playfair Display', Georgia, serif",
}
const h1 = {
  fontSize: '22px',
  fontWeight: 700,
  color: FOREGROUND,
  margin: '28px 0 8px',
  fontFamily: "'Playfair Display', Georgia, serif",
  lineHeight: '1.3',
}
const ruleTag = {
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: PRIMARY,
  margin: '0 0 16px',
}
const summaryText = {
  fontSize: '15px',
  color: MUTED,
  lineHeight: '1.65',
  margin: '0 0 24px',
}
const sectionBox = {
  backgroundColor: LIGHT_BG,
  borderRadius: '8px',
  padding: '16px 18px',
  margin: '0 0 14px',
}
const sectionTitle = {
  fontSize: '12px',
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.1em',
  color: FOREGROUND,
  margin: '0 0 10px',
}
const bulletText = {
  fontSize: '14px',
  color: MUTED,
  lineHeight: '1.6',
  margin: '0 0 6px',
}
const divider = { border: 'none', borderTop: '1px solid #e6e8ea', margin: '24px 0' }
const citationsLabel = {
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.1em',
  color: MUTED,
  margin: '0 0 8px',
}
const citationItem = { fontSize: '13px', margin: '0 0 4px' }
const ctaSection = { textAlign: 'center' as const, margin: '8px 0 24px' }
const ctaButton = {
  backgroundColor: PRIMARY,
  color: '#0d1114',
  fontSize: '13px',
  fontWeight: 700,
  borderRadius: '6px',
  padding: '10px 24px',
  textDecoration: 'none',
  display: 'inline-block',
}
const footer = {
  fontSize: '12px',
  color: MUTED,
  margin: '0',
  paddingTop: '16px',
  borderTop: '1px solid #e6e8ea',
}
const link = { color: PRIMARY, textDecoration: 'none' }
