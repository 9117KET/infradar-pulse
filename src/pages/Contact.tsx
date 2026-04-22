import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, MessageSquare, FileText, Loader2, CheckCircle2 } from 'lucide-react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const contactSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
  email: z
    .string()
    .trim()
    .email('Please enter a valid email')
    .max(255, 'Email is too long'),
  company: z.string().trim().max(150, 'Company is too long').optional().or(z.literal('')),
  subject: z
    .string()
    .trim()
    .min(1, 'Subject is required')
    .max(200, 'Subject is too long'),
  message: z
    .string()
    .trim()
    .min(10, 'Please provide at least 10 characters')
    .max(5000, 'Message is too long'),
});

type ContactFormValues = z.infer<typeof contactSchema>;

export default function Contact() {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof ContactFormValues, string>>>({});
  const [values, setValues] = useState<ContactFormValues>({
    name: '',
    email: '',
    company: '',
    subject: '',
    message: '',
  });

  const update = (key: keyof ContactFormValues) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const parsed = contactSchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof ContactFormValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof ContactFormValues;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      const id = crypto.randomUUID();
      const submission = {
        id,
        name: parsed.data.name,
        email: parsed.data.email,
        company: parsed.data.company || null,
        subject: parsed.data.subject,
        message: parsed.data.message,
      };

      const { error: insertError } = await supabase
        .from('contact_submissions')
        .insert(submission);

      if (insertError) throw insertError;

      // Fire both emails in parallel; failures here shouldn't block the user
      // (the submission is already saved).
      const [confirmation, notification] = await Promise.allSettled([
        supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'contact-confirmation',
            recipientEmail: parsed.data.email,
            idempotencyKey: `contact-confirm-${id}`,
            templateData: {
              name: parsed.data.name,
              subject: parsed.data.subject,
              message: parsed.data.message,
            },
          },
        }),
        supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'contact-notification',
            recipientEmail: 'hello@infradarai.com',
            idempotencyKey: `contact-notify-${id}`,
            templateData: {
              name: parsed.data.name,
              fromEmail: parsed.data.email,
              company: parsed.data.company || undefined,
              subject: parsed.data.subject,
              message: parsed.data.message,
              submissionId: id,
            },
          },
        }),
      ]);

      if (confirmation.status === 'rejected') {
        console.error('Failed to send confirmation email', confirmation.reason);
      }
      if (notification.status === 'rejected') {
        console.error('Failed to send notification email', notification.reason);
      }

      setSubmitted(true);
      setValues({ name: '', email: '', company: '', subject: '', message: '' });
      toast({
        title: 'Message sent',
        description: 'We have received your message and will be in touch shortly.',
      });
    } catch (err) {
      console.error('Contact form error', err);
      toast({
        title: 'Something went wrong',
        description: 'Please try again, or email us directly at hello@infradarai.com.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center mb-12">
          <h1 className="font-serif text-4xl font-bold mb-4">Get in touch</h1>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Have questions about Infradar? We'd love to hear from you. Choose the option that best fits
            your needs.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-3 mb-16">
          <div className="glass-panel rounded-xl p-6 text-center space-y-3">
            <Mail className="h-8 w-8 text-primary mx-auto" />
            <h3 className="font-serif font-semibold">Email us</h3>
            <p className="text-sm text-muted-foreground">For general inquiries and partnerships</p>
            <a href="mailto:hello@infradarai.com">
              <Button variant="outline" size="sm" className="w-full">
                hello@infradarai.com
              </Button>
            </a>
          </div>
          <div className="glass-panel rounded-xl p-6 text-center space-y-3">
            <MessageSquare className="h-8 w-8 text-primary mx-auto" />
            <h3 className="font-serif font-semibold">Book a demo</h3>
            <p className="text-sm text-muted-foreground">See the platform in action with our team</p>
            <Link to="/#engage">
              <Button size="sm" className="w-full teal-glow">Request demo</Button>
            </Link>
          </div>
          <div className="glass-panel rounded-xl p-6 text-center space-y-3">
            <FileText className="h-8 w-8 text-primary mx-auto" />
            <h3 className="font-serif font-semibold">Documentation</h3>
            <p className="text-sm text-muted-foreground">Learn about our platform features</p>
            <Link to="/services">
              <Button variant="outline" size="sm" className="w-full">View services</Button>
            </Link>
          </div>
        </div>

        <div className="mx-auto max-w-2xl">
          <div className="glass-panel rounded-xl p-8 sm:p-10">
            <div className="mb-6 text-center">
              <h2 className="font-serif text-2xl font-bold mb-2">Send us a message</h2>
              <p className="text-sm text-muted-foreground">
                Tell us a bit about your enquiry and we'll be in touch within one business day.
              </p>
            </div>

            {submitted ? (
              <div className="flex flex-col items-center text-center py-8 space-y-4">
                <CheckCircle2 className="h-12 w-12 text-primary" />
                <h3 className="font-serif text-xl font-semibold">Message sent</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Thanks for reaching out. A confirmation email is on its way to your inbox and a
                  member of our team will reply shortly.
                </p>
                <Button variant="outline" onClick={() => setSubmitted(false)}>
                  Send another message
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name *</Label>
                    <Input
                      id="name"
                      value={values.name}
                      onChange={update('name')}
                      maxLength={100}
                      autoComplete="name"
                      required
                      aria-invalid={!!errors.name}
                    />
                    {errors.name && (
                      <p className="text-xs text-destructive">{errors.name}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={values.email}
                      onChange={update('email')}
                      maxLength={255}
                      autoComplete="email"
                      required
                      aria-invalid={!!errors.email}
                    />
                    {errors.email && (
                      <p className="text-xs text-destructive">{errors.email}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company">Company (optional)</Label>
                  <Input
                    id="company"
                    value={values.company}
                    onChange={update('company')}
                    maxLength={150}
                    autoComplete="organization"
                    aria-invalid={!!errors.company}
                  />
                  {errors.company && (
                    <p className="text-xs text-destructive">{errors.company}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subject">Subject *</Label>
                  <Input
                    id="subject"
                    value={values.subject}
                    onChange={update('subject')}
                    maxLength={200}
                    required
                    aria-invalid={!!errors.subject}
                  />
                  {errors.subject && (
                    <p className="text-xs text-destructive">{errors.subject}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Message *</Label>
                  <Textarea
                    id="message"
                    value={values.message}
                    onChange={update('message')}
                    maxLength={5000}
                    rows={6}
                    required
                    aria-invalid={!!errors.message}
                  />
                  <div className="flex items-center justify-between">
                    {errors.message ? (
                      <p className="text-xs text-destructive">{errors.message}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {values.message.length}/5000 characters
                      </p>
                    )}
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full teal-glow"
                  disabled={submitting}
                  size="lg"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
                    </>
                  ) : (
                    'Send message'
                  )}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  By submitting, you agree to our{' '}
                  <Link to="/privacy" className="underline hover:text-primary">
                    Privacy Notice
                  </Link>
                  .
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
