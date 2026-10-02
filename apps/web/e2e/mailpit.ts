import { expect } from '@playwright/test';
import { E2E } from '../playwright.config';

interface MailSummary {
  ID: string;
  Subject: string;
  To: Array<{ Address: string }>;
}

/** Mailpit'te belirli adrese gelen son e-postanın metnini bekler ve döndürür. */
export async function waitForMail(to: string): Promise<{ subject: string; text: string }> {
  let found: MailSummary | undefined;
  await expect
    .poll(
      async () => {
        const res = await fetch(`${E2E.mailpitUrl}/api/v1/messages?limit=50`);
        const { messages } = (await res.json()) as { messages: MailSummary[] };
        found = messages.find((m) => m.To.some((t) => t.Address === to));
        return found !== undefined;
      },
      { message: `${to} adresine e-posta gelmedi`, timeout: 15_000 },
    )
    .toBe(true);
  const res = await fetch(`${E2E.mailpitUrl}/api/v1/message/${found!.ID}`);
  const body = (await res.json()) as { Subject: string; Text: string };
  return { subject: body.Subject, text: body.Text };
}
