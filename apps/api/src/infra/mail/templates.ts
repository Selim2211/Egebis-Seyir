import type { Locale, WorkspaceRole } from '@scrum/shared';

/** Rol adları arayüzle aynı (her iki dilde İngilizce Scrum/ClickUp terimleri). */
const ROLE_LABEL: Record<WorkspaceRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  GUEST: 'Guest',
};

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** Sade, e-posta istemcilerinde güvenli tek sütun düzen. */
function layout(
  title: string,
  paragraphs: string[],
  action: { label: string; url: string },
  footer: string,
): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px">${p}</p>`).join('');
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#1a1a1e">
<table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:10px;border:1px solid #e4e4e7">
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(title)}</h1>
${body}
<p style="margin:22px 0"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:bold">${escapeHtml(action.label)}</a></p>
<p style="margin:0;font-size:12px;color:#62626b">${footer}</p>
</td></tr></table></body></html>`;
}

export function invitationMail(p: {
  to: string;
  locale: Locale;
  workspaceName: string;
  inviterName: string;
  role: WorkspaceRole;
  url: string;
  expiresInDays: number;
}): MailMessage {
  const ws = escapeHtml(p.workspaceName);
  const inviter = escapeHtml(p.inviterName);
  const role = ROLE_LABEL[p.role];
  if (p.locale === 'en') {
    return {
      to: p.to,
      subject: `You're invited to ${p.workspaceName}`,
      text: `${p.inviterName} invited you to the ${p.workspaceName} workspace as ${role}.\n\nCreate your account: ${p.url}\n\nThis link expires in ${p.expiresInDays} days and can be used once.`,
      html: layout(
        `Join ${p.workspaceName}`,
        [
          `<strong>${inviter}</strong> invited you to the <strong>${ws}</strong> workspace as <strong>${role}</strong>.`,
        ],
        { label: 'Accept invitation', url: p.url },
        `This link expires in ${p.expiresInDays} days and can be used once. If you weren't expecting it, you can ignore this email.`,
      ),
    };
  }
  return {
    to: p.to,
    subject: `${p.workspaceName} çalışma alanına davet edildin`,
    text: `${p.inviterName} seni ${p.workspaceName} workspace'ine ${role} olarak davet etti.\n\nHesabını oluştur: ${p.url}\n\nBağlantı ${p.expiresInDays} gün geçerlidir ve bir kez kullanılabilir.`,
    html: layout(
      `${p.workspaceName} workspace'ine katıl`,
      [
        `<strong>${inviter}</strong> seni <strong>${ws}</strong> workspace'ine <strong>${role}</strong> olarak davet etti.`,
      ],
      { label: 'Daveti kabul et', url: p.url },
      `Bağlantı ${p.expiresInDays} gün geçerlidir ve bir kez kullanılabilir. Bu daveti beklemiyorsan e-postayı yok sayabilirsin.`,
    ),
  };
}

export function passwordResetMail(p: {
  to: string;
  locale: Locale;
  name: string;
  url: string;
  expiresInMinutes: number;
}): MailMessage {
  const name = escapeHtml(p.name);
  if (p.locale === 'en') {
    return {
      to: p.to,
      subject: 'Reset your password',
      text: `Hi ${p.name},\n\nReset your password: ${p.url}\n\nThis link expires in ${p.expiresInMinutes} minutes. If you didn't request it, ignore this email.`,
      html: layout(
        'Reset your password',
        [`Hi ${name}, we received a request to reset your Scrum Manager password.`],
        { label: 'Set a new password', url: p.url },
        `This link expires in ${p.expiresInMinutes} minutes. If you didn't request it, ignore this email; your password stays the same.`,
      ),
    };
  }
  return {
    to: p.to,
    subject: 'Şifre sıfırlama',
    text: `Merhaba ${p.name},\n\nŞifreni sıfırla: ${p.url}\n\nBağlantı ${p.expiresInMinutes} dakika geçerlidir. Bu isteği sen yapmadıysan e-postayı yok say.`,
    html: layout(
      'Şifreni sıfırla',
      [`Merhaba ${name}, Scrum Manager şifreni sıfırlama isteği aldık.`],
      { label: 'Yeni şifre belirle', url: p.url },
      `Bağlantı ${p.expiresInMinutes} dakika geçerlidir. Bu isteği sen yapmadıysan e-postayı yok say; şifren değişmez.`,
    ),
  };
}
