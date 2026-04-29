/**
 * Curated list of well-known disposable / throwaway email providers.
 * We block signups from these to prevent free-trial abuse and quota gaming.
 *
 * Keep the list lowercase. Match is exact on the domain (after the @).
 * We also strip subdomains down to the registrable domain for matching,
 * so `inbox.mailinator.com` is caught by `mailinator.com`.
 */
export const DISPOSABLE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  // Mailinator family
  "mailinator.com",
  "mailinator.net",
  "mailinator.org",
  "mailinator2.com",
  "reallymymail.com",
  "binkmail.com",
  "bobmail.info",
  "chammy.info",
  "devnullmail.com",
  "letthemeatspam.com",
  "mailinater.com",
  "mailinator.us",
  "mailinator.info",
  "notmailinator.com",
  "spamherelots.com",
  "spamhereplease.com",
  "streetwisemail.com",
  "suremail.info",
  "thisisnotmyrealemail.com",
  "tradermail.info",
  "veryrealemail.com",
  "zippymail.info",

  // Guerrilla Mail family
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "guerrillamail.biz",
  "guerrillamail.de",
  "guerrillamailblock.com",
  "grr.la",
  "sharklasers.com",
  "spam4.me",
  "pokemail.net",

  // 10MinuteMail family
  "10minutemail.com",
  "10minutemail.net",
  "10minutemail.org",
  "10minutemail.co.uk",
  "10minutemail.de",
  "20minutemail.com",
  "30minutemail.com",
  "10minutesmail.com",
  "tempmailo.com",

  // Temp-Mail family
  "temp-mail.org",
  "temp-mail.io",
  "tempmail.com",
  "tempmail.net",
  "tempmail.dev",
  "tempmail.email",
  "tempmail.plus",
  "tempmailaddress.com",
  "temp-mail.ru",
  "tempinbox.com",
  "tempmailer.com",
  "tempmailer.de",

  // YOPmail
  "yopmail.com",
  "yopmail.fr",
  "yopmail.net",
  "cool.fr.nf",
  "jetable.fr.nf",
  "nospam.ze.tc",
  "nomail.xl.cx",
  "mega.zik.dj",
  "speed.1s.fr",
  "courriel.fr.nf",
  "moncourrier.fr.nf",
  "monemail.fr.nf",
  "monmail.fr.nf",

  // Throwaway/Trash mail
  "trashmail.com",
  "trashmail.net",
  "trashmail.org",
  "trashmail.de",
  "trashmail.io",
  "trashmail.me",
  "trash-mail.com",
  "trash-mail.de",
  "wegwerfemail.de",
  "wegwerfmail.de",
  "wegwerfmail.net",
  "wegwerfmail.org",
  "kurzepost.de",
  "objectmail.com",
  "proxymail.eu",
  "rcpt.at",
  "fakeinbox.com",
  "fakemail.fr",
  "fakemailgenerator.com",
  "throwawaymail.com",

  // GetNada / Nada
  "getnada.com",
  "nada.email",
  "nada.ltd",

  // EmailOnDeck
  "emailondeck.com",

  // Maildrop
  "maildrop.cc",
  "maildrop.email",

  // Dispostable
  "dispostable.com",

  // Mohmal
  "mohmal.com",

  // Mailnesia
  "mailnesia.com",

  // Mintemail
  "mintemail.com",

  // Mytemp.email / Mytrashmail
  "mytemp.email",
  "mytrashmail.com",

  // Inboxbear / Inboxkitten
  "inboxbear.com",
  "inboxkitten.com",

  // Generators / Burner
  "burnermail.io",
  "discard.email",
  "discardmail.com",
  "discardmail.de",
  "spambog.com",
  "spambog.de",
  "spambog.ru",
  "spambox.us",
  "spamgourmet.com",
  "spamgourmet.net",
  "spamgourmet.org",
  "mailcatch.com",
  "mailtemp.info",
  "mail-temp.com",
  "mail-temporaire.fr",
  "moakt.com",
  "mvrht.com",
  "owlpic.com",
  "tafmail.com",
  "harakirimail.com",
  "tmpeml.info",
  "tmpmail.org",
  "tmpmail.net",
  "tmpbox.net",
  "deadaddress.com",
  "byom.de",

  // Anonymouse
  "anonymouse.org",
  "anonymbox.com",

  // Random newer ones
  "emltmp.com",
  "fakermail.com",
  "fexbox.org",
  "fexbox.ru",
  "fexpost.com",
  "incognitomail.com",
  "instaddr.win",
  "kinglibrary.net",
  "linshiyouxiang.net",
  "mailbox52.ga",
  "mailbox80.biz",
  "mailbox82.biz",
  "mailbox87.de",
  "mailbox92.biz",
  "mintemail.net",
  "monumentmail.com",
  "rainmail.biz",
  "shitmail.me",
  "shitware.nl",
  "smashmail.de",
  "spam.la",
  "spambox.info",
  "spamspot.com",
  "tempemail.net",
  "tempr.email",
  "vomoto.com",
  "yourdomain.com",

  // Lots of recent ones
  "mailpoof.com",
  "snapmail.cc",
  "luxusmail.org",
  "smailpro.com",
  "etranquil.com",
  "emltmp.com",
  "mailtemp.uk",
  "tempmail.us.com",
  "minuteinbox.com",
  "anonaddy.me",
  "addy.io",
  "simplelogin.com",
  "simplelogin.io",
  "duck.com",
  "relay.firefox.com",
  "mozmail.com",
  "privaterelay.appleid.com",
  "hide-my-email.com",
  "fastmailmask.com",
  "edu.sg.com",
  "emailtmp.com",
  "emailtemp.org",
  "tempmailbox.com",
  "tempmailbox.net",
  "temporary-mail.net",
  "temporaryemail.net",
  "temporaryemail.us",
  "throwaway.email",
  "throwawaymail.net",
  "throwawaymail.org",
  "fakemail.net",
  "fakemail.io",
  "fake-mail.net",
  "fake-mail.ml",
  "fakeemail.net",
  "fakeemailaddress.com",
  "mail7.io",
  "mail.tm",
  "mail.gw",
  "dropmail.me",
  "dropmail.ml",
  "tmpmail.co",
  "tmpmail.io",
  "tmail.io",
  "tmail.ws",
  "1secmail.com",
  "1secmail.org",
  "1secmail.net",
  "esiix.com",
  "xojxe.com",
  "yoggm.com",
  "rteet.com",
  "dcobe.com",
  "wuuvo.com",
  "vjuum.com",
  "disposablemail.com",
  "disposable-email.ml",
  "getairmail.com",
  "airmail.cc",
  "mailnesia.net",
  "mailhazard.com",
  "mailhazard.us",
  "spamfree24.org",
  "spamfree24.com",
  "spamfree24.de",
  "spamfree24.eu",
  "spamfree24.net",
  "spamfree24.info",
  "0-mail.com",
  "0815.ru",
  "0815.su",
  "0815.ry",
]);

const SUSPICIOUS_DOMAIN_PATTERNS = /(^|[.-])(temp|tmp|trash|throwaway|disposable|burner|fake|spam|mailinator|yopmail|guerrilla|10minute|minute|inbox|nada|discard|anon)([.-]|$)/i;

export type DisposableCheckResult =
  | { ok: true; domain: string }
  | { ok: false; reason: "INVALID_EMAIL" | "DISPOSABLE_EMAIL"; domain?: string };

/**
 * Validate an email and check it against the disposable provider list.
 * Strips obvious sub-domains so e.g. `inbox.mailinator.com` is caught.
 */
export function checkDisposableEmail(email: string | null | undefined): DisposableCheckResult {
  if (!email || typeof email !== "string") {
    return { ok: false, reason: "INVALID_EMAIL" };
  }
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) {
    return { ok: false, reason: "INVALID_EMAIL" };
  }
  const domain = trimmed.slice(at + 1);
  if (!domain.includes(".") || /\s/.test(domain)) {
    return { ok: false, reason: "INVALID_EMAIL" };
  }

  // Walk through suffixes (sub.foo.example.com -> foo.example.com -> example.com)
  // so subdomains of known throwaway providers are caught.
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join(".");
    if (DISPOSABLE_EMAIL_DOMAINS.has(candidate)) {
      return { ok: false, reason: "DISPOSABLE_EMAIL", domain: candidate };
    }
  }

  if (SUSPICIOUS_DOMAIN_PATTERNS.test(domain)) {
    return { ok: false, reason: "DISPOSABLE_EMAIL", domain };
  }

  return { ok: true, domain };
}

export const DISPOSABLE_EMAIL_MESSAGE =
  "Please sign up with a real Gmail or work email. Disposable, masked, relay, or temporary email providers are not supported.";
