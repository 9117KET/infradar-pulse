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

const PRIMARY = 'hsl(170, 55%, 63%)'
const FOREGROUND = '#0d1114'
const MUTED = '#55636a'

interface ContactNotificationProps {
  name?: string
  fromEmail?: string
  company?: string
  subject?: string
  message?: string
  submissionId?: string
}

const ContactNotificationEmail = ({
  name,
  fromEmail,
  company,
  subject,
  message,
  submissionId,
}: ContactNotificationProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New contact form submission from {name ?? 'a visitor'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={brandBar}>
          <Text style={brandText}>INFRADAR &middot; INTERNAL</Text>
        </Section>

        <Heading style={h1}>New contact submission</Heading>

        <Section style={summaryBox}>
          <Text style={summaryLabel}>From</Text>
          <Text style={summaryValue}>
            {name ?? 'Unknown'} {fromEmail ? `<${fromEmail}>` : ''}
          </Text>

          {company ? (
            <>
              <Text style={summaryLabel}>Company</Text>
              <Text style={summaryValue}>{company}</Text>
            </>
          ) : null}

          {subject ? (
            <>
              <Text style={summaryLabel}>Subject</Text>
              <Text style={summaryValue}>{subject}</Text>
            </>
          ) : null}

          {message ? (
            <>
              <Text style={summaryLabel}>Message</Text>
              <Text style={summaryValue}>{message}</Text>
            </>
          ) : null}

          {submissionId ? (
            <>
              <Text style={summaryLabel}>Submission ID</Text>
              <Text style={{ ...summaryValue, fontSize: '12px', color: MUTED }}>
                {submissionId}
              </Text>
            </>
          ) : null}
        </Section>

        <Text style={text}>
          Reply directly to this email to respond to {name ?? 'the sender'}.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ContactNotificationEmail,
  subject: (data: Record<string, any>) =>
    `New contact: ${data?.subject ?? 'website enquiry'}`,
  displayName: 'Contact form internal notification',
  previewData: {
    name: 'Jane Doe',
    fromEmail: 'jane@example.com',
    company: 'Acme Infrastructure',
    subject: 'Question about coverage in West Africa',
    message: 'Hi, I would like to know if you cover the Lekki Deep Sea Port project.',
    submissionId: '00000000-0000-0000-0000-000000000000',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
}
const container = { padding: '24px 28px', maxWidth: '560px' }
const brandBar = { paddingBottom: '12px', borderBottom: `2px solid ${PRIMARY}` }
const brandText = {
  margin: 0,
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.2em',
  color: FOREGROUND,
}
const h1 = {
  fontSize: '22px',
  fontWeight: 700,
  color: FOREGROUND,
  margin: '24px 0 16px',
  fontFamily: "'Playfair Display', Georgia, serif",
}
const text = {
  fontSize: '14px',
  color: MUTED,
  lineHeight: '1.6',
  margin: '16px 0 0',
}
const summaryBox = {
  backgroundColor: '#f5f7f8',
  borderRadius: '8px',
  padding: '16px 18px',
  margin: '8px 0 16px',
}
const summaryLabel = {
  fontSize: '11px',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.1em',
  color: MUTED,
  margin: '8px 0 4px',
  fontWeight: 600,
}
const summaryValue = {
  fontSize: '14px',
  color: FOREGROUND,
  margin: '0 0 6px',
  lineHeight: '1.5',
  whiteSpace: 'pre-wrap' as const,
}
