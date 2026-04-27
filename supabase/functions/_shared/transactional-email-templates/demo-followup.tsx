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

interface DemoFollowupProps {
  name?: string
  step?: number          // 1 = day-3, 2 = day-7
  sector?: string        // from their preferences
  region?: string
}

const DemoFollowupEmail = ({
  name,
  step = 1,
  sector,
  region,
}: DemoFollowupProps) => {
  const greeting = name ? `Hi ${name},` : 'Hi,'

  const day3Body = (
    <>
      <Text style={text}>
        Following up on your demo request for {SITE_NAME}. I wanted to share
        one specific capability you might find useful
        {sector ? ` for ${sector} coverage` : ''}
        {region ? ` in ${region}` : ''}.
      </Text>
      <Text style={text}>
        The Research Hub lets you type a plain-English query — "infrastructure projects
        in Ghana energy sector" — and watch AI agents search, scrape, and extract
        structured project data in real time. Each result comes with a confidence score,
        source URLs, and key contacts automatically harvested.
      </Text>
      <Text style={text}>
        You can export results as a watermarked PDF or Excel file, licensed to your account
        for audit traceability.
      </Text>
    </>
  )

  const day7Body = (
    <>
      <Text style={text}>
        I wanted to close the loop on your {SITE_NAME} demo request. If the timing
        wasn't right, no problem — I'll leave it here.
      </Text>
      <Text style={text}>
        If you're still curious, the free tier gives you full access to the dashboard,
        2 AI queries per day, and the ability to track up to 25 projects in your portfolio
        — no credit card required.
      </Text>
      <Text style={text}>
        Happy to answer any questions or set up a proper demo call. Just reply to this email.
      </Text>
    </>
  )

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>
        {step === 1
          ? `A quick demo of InfradarAI's Research Hub for you`
          : `Closing the loop on your InfradarAI demo request`}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={brandBar}>
            <Text style={brandText}>{SITE_NAME}</Text>
          </Section>

          <Heading style={h1}>{greeting}</Heading>

          {step === 1 ? day3Body : day7Body}

          <Section style={{ textAlign: 'center' as const, margin: '28px 0' }}>
            <Button
              href={DASHBOARD_URL}
              style={btn}
            >
              {step === 1 ? 'Try the Research Hub' : 'Start for free'}
            </Button>
          </Section>

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
  component: DemoFollowupEmail,
  subject: (data: Record<string, any>) =>
    data.step === 2
      ? 'Closing the loop on your InfradarAI request'
      : 'A quick look at InfradarAI Research Hub',
  displayName: 'Demo request follow-up',
  previewData: {
    name: 'Jane',
    step: 1,
    sector: 'Energy',
    region: 'Sub-Saharan Africa',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
}
const container = { padding: '24px 28px', maxWidth: '560px' }
const brandBar = { paddingBottom: '16px', borderBottom: `2px solid ${PRIMARY}` }
const brandText = {
  margin: 0, fontSize: '14px', fontWeight: 700, letterSpacing: '0.18em',
  color: FOREGROUND, fontFamily: "'Playfair Display', Georgia, serif",
}
const h1 = {
  fontSize: '22px', fontWeight: 700, color: FOREGROUND,
  margin: '28px 0 16px', fontFamily: "'Playfair Display', Georgia, serif",
}
const text = { fontSize: '15px', color: MUTED, lineHeight: '1.6', margin: '0 0 18px' }
const btn = {
  backgroundColor: PRIMARY, color: FOREGROUND, borderRadius: '6px',
  padding: '12px 24px', fontSize: '14px', fontWeight: 600, textDecoration: 'none',
  display: 'inline-block',
}
const footer = { fontSize: '12px', color: MUTED, margin: '32px 0 0', paddingTop: '16px', borderTop: '1px solid #e6e8ea' }
const link = { color: PRIMARY, textDecoration: 'none' }
