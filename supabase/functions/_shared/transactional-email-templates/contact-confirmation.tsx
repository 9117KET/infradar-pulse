/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Infradar'
const SITE_URL = 'https://infradarai.com'
const PRIMARY = 'hsl(170, 55%, 63%)'
const FOREGROUND = '#0d1114'
const MUTED = '#55636a'

interface ContactConfirmationProps {
  name?: string
  subject?: string
  message?: string
}

const ContactConfirmationEmail = ({
  name,
  subject,
  message,
}: ContactConfirmationProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>We received your message at {SITE_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={brandBar}>
          <Text style={brandText}>{SITE_NAME}</Text>
        </Section>

        <Heading style={h1}>
          {name ? `Thanks, ${name}.` : 'Thanks for reaching out.'}
        </Heading>

        <Text style={text}>
          We have received your message and a member of the Infradar team will
          get back to you shortly. Most enquiries get a response within one
          business day.
        </Text>

        {subject ? (
          <Section style={summaryBox}>
            <Text style={summaryLabel}>Subject</Text>
            <Text style={summaryValue}>{subject}</Text>
            {message ? (
              <>
                <Text style={summaryLabel}>Your message</Text>
                <Text style={summaryValue}>{message}</Text>
              </>
            ) : null}
          </Section>
        ) : null}

        <Text style={text}>
          If your enquiry is urgent, you can reply directly to this email.
        </Text>

        <Text style={footer}>
          {SITE_NAME} &middot;{' '}
          <a href={SITE_URL} style={link}>
            infradarai.com
          </a>
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ContactConfirmationEmail,
  subject: 'We received your message',
  displayName: 'Contact form confirmation',
  previewData: {
    name: 'Jane Doe',
    subject: 'Question about coverage in West Africa',
    message: 'Hi, I would like to know if you cover the Lekki Deep Sea Port project.',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
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
const text = {
  fontSize: '15px',
  color: MUTED,
  lineHeight: '1.6',
  margin: '0 0 18px',
}
const summaryBox = {
  backgroundColor: '#f5f7f8',
  borderRadius: '8px',
  padding: '16px 18px',
  margin: '8px 0 24px',
}
const summaryLabel = {
  fontSize: '11px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.1em',
  color: MUTED,
  margin: '6px 0 4px',
  fontWeight: 600,
}
const summaryValue = {
  fontSize: '14px',
  color: FOREGROUND,
  margin: '0 0 10px',
  lineHeight: '1.5',
  whiteSpace: 'pre-wrap' as const,
}
const footer = {
  fontSize: '12px',
  color: MUTED,
  margin: '32px 0 0',
  paddingTop: '16px',
  borderTop: '1px solid #e6e8ea',
}
const link = { color: PRIMARY, textDecoration: 'none' }
