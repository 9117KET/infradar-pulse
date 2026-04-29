/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
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

interface PilotAccessGrantedProps {
  email?: string
  seatNumber?: number | null
  endsAt?: string
  durationDays?: number
}

const PilotAccessGrantedEmail = ({
  email,
  seatNumber,
  endsAt,
  durationDays = 30,
}: PilotAccessGrantedProps) => {
  const formattedEnd = endsAt
    ? new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(endsAt))
    : null

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Your InfradarAI Pro access is now active</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={brandBar}>
            <Text style={brandText}>{SITE_NAME}</Text>
          </Section>

          <Heading style={h1}>Your Pro access is active.</Heading>

          <Text style={text}>
            Welcome to the InfradarAI pilot. The account{email ? ` for ${email}` : ''} now has {durationDays} days of full Pro access with no credit card required.
          </Text>

          <Section style={summaryBox}>
            <Text style={summaryLabel}>Pilot access</Text>
            <Text style={summaryValue}>Pro / premium platform access</Text>
            {seatNumber ? (
              <>
                <Text style={summaryLabel}>Seat</Text>
                <Text style={summaryValue}>#{seatNumber}</Text>
              </>
            ) : null}
            {formattedEnd ? (
              <>
                <Text style={summaryLabel}>Access until</Text>
                <Text style={summaryValue}>{formattedEnd}</Text>
              </>
            ) : null}
          </Section>

          <Text style={text}>
            You can now explore verified infrastructure projects, premium intelligence, alerts, exports, and AI-powered research workflows inside the platform.
          </Text>

          <Section style={{ textAlign: 'center' as const, margin: '28px 0' }}>
            <Button href={DASHBOARD_URL} style={btn}>Open InfradarAI</Button>
          </Section>

          <Text style={footer}>
            {SITE_NAME} &middot;{' '}
            <a href={SITE_URL} style={link}>infradarai.com</a>
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: PilotAccessGrantedEmail,
  subject: 'Your InfradarAI Pro access is active',
  displayName: 'Pilot access granted',
  previewData: {
    email: 'jane@company.com',
    seatNumber: 12,
    durationDays: 30,
    endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
}
const container = { padding: '24px 28px', maxWidth: '560px' }
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
  fontSize: '24px',
  fontWeight: 700,
  color: FOREGROUND,
  margin: '28px 0 16px',
  fontFamily: "'Playfair Display', Georgia, serif",
}
const text = { fontSize: '15px', color: MUTED, lineHeight: '1.6', margin: '0 0 18px' }
const summaryBox = { backgroundColor: '#f5f7f8', borderRadius: '8px', padding: '16px 18px', margin: '8px 0 24px' }
const summaryLabel = { fontSize: '11px', textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: MUTED, margin: '6px 0 4px', fontWeight: 600 }
const summaryValue = { fontSize: '14px', color: FOREGROUND, margin: '0 0 10px', lineHeight: '1.5' }
const btn = { backgroundColor: PRIMARY, color: FOREGROUND, borderRadius: '6px', padding: '12px 24px', fontSize: '14px', fontWeight: 600, textDecoration: 'none', display: 'inline-block' }
const footer = { fontSize: '12px', color: MUTED, margin: '32px 0 0', paddingTop: '16px', borderTop: '1px solid #e6e8ea' }
const link = { color: PRIMARY, textDecoration: 'none' }